//! Push notification handling via Home Assistant websocket API.
//!
//! Connects to Home Assistant's websocket API and subscribes to
//! push notifications for registered devices.

mod websocket;

pub use websocket::{start_notification_listener, NotificationHandle};
