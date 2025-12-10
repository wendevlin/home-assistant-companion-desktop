//! WebSocket connection to Home Assistant for push notifications.

use futures_util::{SinkExt, StreamExt};
use notify_rust::Notification;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Handle to control the notification listener.
pub struct NotificationHandle {
    #[allow(dead_code)]
    stop_tx: mpsc::Sender<()>,
    #[allow(dead_code)]
    running: Arc<AtomicBool>,
}

impl NotificationHandle {
    /// Check if the listener is still running.
    #[allow(dead_code)]
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Stop the notification listener.
    #[allow(dead_code)]
    pub async fn stop(&self) {
        let _ = self.stop_tx.send(()).await;
    }
}

/// Messages sent to Home Assistant websocket.
#[derive(Serialize, Debug)]
#[serde(tag = "type")]
enum WsOutMessage {
    #[serde(rename = "auth")]
    Auth { access_token: String },
    #[serde(rename = "mobile_app/push_notification_channel")]
    SubscribePushNotifications {
        id: u64,
        webhook_id: String,
        support_confirm: bool,
    },
    #[serde(rename = "mobile_app/push_notification_confirm")]
    ConfirmNotification {
        id: u64,
        webhook_id: String,
        confirm_id: String,
    },
}

/// Messages received from Home Assistant websocket.
#[derive(Deserialize, Debug)]
struct WsInMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[allow(dead_code)]
    #[serde(default)]
    id: Option<u64>,
    #[serde(default)]
    success: Option<bool>,
    #[serde(default)]
    event: Option<NotificationEvent>,
    #[serde(default)]
    ha_version: Option<String>,
}

/// A push notification event from Home Assistant.
#[derive(Deserialize, Debug, Clone)]
pub struct NotificationEvent {
    pub message: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub hass_confirm_id: Option<String>,
    #[serde(default)]
    pub data: Option<NotificationData>,
}

/// Additional notification data.
#[derive(Deserialize, Debug, Clone)]
#[allow(dead_code)]
pub struct NotificationData {
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub image: Option<String>,
}

/// Start the notification listener for a server.
///
/// Returns a handle that can be used to stop the listener.
pub async fn start_notification_listener(
    server_url: &str,
    access_token: &str,
    webhook_id: &str,
) -> Result<NotificationHandle, String> {
    let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);
    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();

    // Convert HTTP URL to WebSocket URL
    let ws_url = server_url
        .replace("https://", "wss://")
        .replace("http://", "ws://");
    let ws_url = format!("{}/api/websocket", ws_url.trim_end_matches('/'));

    let access_token = access_token.to_string();
    let webhook_id = webhook_id.to_string();

    tokio::spawn(async move {
        println!("HA Desktop: Connecting to websocket at {}", ws_url);

        let result = run_notification_loop(&ws_url, &access_token, &webhook_id, &mut stop_rx).await;

        if let Err(e) = result {
            println!("HA Desktop: Notification listener error: {}", e);
        }

        running_clone.store(false, Ordering::SeqCst);
        println!("HA Desktop: Notification listener stopped");
    });

    Ok(NotificationHandle { stop_tx, running })
}

/// Stop the notification listener.
#[allow(dead_code)]
pub async fn stop_notification_listener(handle: &NotificationHandle) {
    handle.stop().await;
}

/// Main notification loop.
async fn run_notification_loop(
    ws_url: &str,
    access_token: &str,
    webhook_id: &str,
    stop_rx: &mut mpsc::Receiver<()>,
) -> Result<(), String> {
    let (ws_stream, _) = connect_async(ws_url)
        .await
        .map_err(|e| format!("Failed to connect to websocket: {}", e))?;

    let (mut write, mut read) = ws_stream.split();
    let msg_id = AtomicU64::new(1);

    // Wait for auth_required message
    let auth_required = read
        .next()
        .await
        .ok_or("Connection closed before auth_required")?
        .map_err(|e| format!("Failed to receive auth_required: {}", e))?;

    let auth_msg: WsInMessage = serde_json::from_str(&auth_required.to_string())
        .map_err(|e| format!("Failed to parse auth_required: {}", e))?;

    if auth_msg.msg_type != "auth_required" {
        return Err(format!(
            "Expected auth_required, got: {}",
            auth_msg.msg_type
        ));
    }

    println!(
        "HA Desktop: Connected to Home Assistant {}",
        auth_msg.ha_version.as_deref().unwrap_or("unknown")
    );

    // Send auth message
    let auth = WsOutMessage::Auth {
        access_token: access_token.to_string(),
    };
    let auth_json =
        serde_json::to_string(&auth).map_err(|e| format!("Failed to serialize auth: {}", e))?;
    write
        .send(Message::Text(auth_json.into()))
        .await
        .map_err(|e| format!("Failed to send auth: {}", e))?;

    // Wait for auth_ok
    let auth_response = read
        .next()
        .await
        .ok_or("Connection closed before auth_ok")?
        .map_err(|e| format!("Failed to receive auth response: {}", e))?;

    let auth_result: WsInMessage = serde_json::from_str(&auth_response.to_string())
        .map_err(|e| format!("Failed to parse auth response: {}", e))?;

    if auth_result.msg_type != "auth_ok" {
        return Err(format!("Auth failed: {:?}", auth_result));
    }

    println!("HA Desktop: Authenticated with Home Assistant");

    // Subscribe to push notifications
    let subscribe_id = msg_id.fetch_add(1, Ordering::SeqCst);
    let subscribe = WsOutMessage::SubscribePushNotifications {
        id: subscribe_id,
        webhook_id: webhook_id.to_string(),
        support_confirm: true,
    };
    let subscribe_json = serde_json::to_string(&subscribe)
        .map_err(|e| format!("Failed to serialize subscribe: {}", e))?;
    write
        .send(Message::Text(subscribe_json.into()))
        .await
        .map_err(|e| format!("Failed to send subscribe: {}", e))?;

    println!("HA Desktop: Subscribed to push notifications");

    // Main message loop
    loop {
        tokio::select! {
            _ = stop_rx.recv() => {
                println!("HA Desktop: Notification listener received stop signal");
                break;
            }
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ws_msg) = serde_json::from_str::<WsInMessage>(&text) {
                            match ws_msg.msg_type.as_str() {
                                "event" => {
                                    if let Some(event) = ws_msg.event {
                                        show_notification(&event);

                                        // Send confirmation if required
                                        if let Some(confirm_id) = &event.hass_confirm_id {
                                            let confirm_msg_id = msg_id.fetch_add(1, Ordering::SeqCst);
                                            let confirm = WsOutMessage::ConfirmNotification {
                                                id: confirm_msg_id,
                                                webhook_id: webhook_id.to_string(),
                                                confirm_id: confirm_id.clone(),
                                            };
                                            if let Ok(confirm_json) = serde_json::to_string(&confirm) {
                                                let _ = write.send(Message::Text(confirm_json.into())).await;
                                            }
                                        }
                                    }
                                }
                                "result" => {
                                    if ws_msg.success == Some(false) {
                                        println!("HA Desktop: Subscription failed: {:?}", ws_msg);
                                    }
                                }
                                "pong" => {
                                    // Ignore pong messages
                                }
                                _ => {
                                    // Ignore other message types
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        println!("HA Desktop: WebSocket closed by server");
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = write.send(Message::Pong(data)).await;
                    }
                    Some(Err(e)) => {
                        println!("HA Desktop: WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        println!("HA Desktop: WebSocket stream ended");
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

/// Display a system notification.
///
/// Uses notify-send command directly as it's more reliable across different
/// desktop environments and doesn't get suppressed when the app is "focused".
fn show_notification(event: &NotificationEvent) {
    let title = event
        .title
        .as_deref()
        .unwrap_or("Home Assistant");

    let body = if let Some(data) = &event.data {
        if let Some(subtitle) = &data.subtitle {
            format!("{}\n{}", subtitle, event.message)
        } else {
            event.message.clone()
        }
    } else {
        event.message.clone()
    };

    // Use notify-send directly - more reliable and doesn't get suppressed
    use std::process::Command;

    let result = Command::new("notify-send")
        .arg("--app-name=Home Assistant")
        .arg("--icon=home-assistant")
        .arg("--urgency=normal")
        .arg(title)
        .arg(&body)
        .spawn();

    match result {
        Ok(_) => {
            println!("HA Desktop: Notification sent: {} - {}", title, body);
        }
        Err(e) => {
            println!("HA Desktop: Failed to send notification: {}", e);
            // Try notify-rust as fallback
            if let Err(e2) = Notification::new()
                .summary(title)
                .body(&body)
                .appname("Home Assistant")
                .icon("dialog-information")
                .show()
            {
                println!("HA Desktop: notify-rust fallback also failed: {}", e2);
            }
        }
    }
}
