//! Common types used by all sensors.

use serde::{Deserialize, Serialize};

/// Definition of a sensor that can be registered with Home Assistant.
///
/// This contains all the metadata needed to register the sensor and
/// display it in the UI.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SensorDefinition {
    /// Unique identifier for the sensor (e.g., "battery_level")
    pub id: String,
    /// Human-readable name (e.g., "Battery Level")
    pub name: String,
    /// Home Assistant device class (e.g., "battery", "temperature")
    pub device_class: Option<String>,
    /// State class for statistics (e.g., "measurement", "total_increasing")
    pub state_class: Option<String>,
    /// Unit of measurement (e.g., "%", "GB", "°C")
    pub unit: Option<String>,
    /// MDI icon name (e.g., "mdi:battery")
    pub icon: String,
    /// Either "sensor" or "binary_sensor"
    pub sensor_type: String,
    /// Entity category (e.g., "diagnostic", "config")
    pub entity_category: Option<String>,
    /// Whether this sensor should be enabled by default
    pub default_enabled: bool,
}

/// A single sensor reading with its current value.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SensorReading {
    /// The sensor ID this reading belongs to
    pub id: String,
    /// The current sensor value
    pub state: SensorValue,
    /// Optional additional attributes
    pub attributes: Option<serde_json::Value>,
}

/// Possible value types for sensor readings.
///
/// This enum allows sensors to report different data types while
/// maintaining type safety and proper JSON serialization.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum SensorValue {
    String(String),
    Number(f64),
    Integer(i64),
    Boolean(bool),
}

impl std::fmt::Display for SensorValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SensorValue::String(s) => write!(f, "{}", s),
            SensorValue::Number(n) => write!(f, "{}", n),
            SensorValue::Integer(i) => write!(f, "{}", i),
            SensorValue::Boolean(b) => write!(f, "{}", b),
        }
    }
}

impl SensorDefinition {
    /// Creates a new sensor definition with required fields.
    pub fn new(id: &str, name: &str, icon: &str, sensor_type: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            device_class: None,
            state_class: None,
            unit: None,
            icon: icon.to_string(),
            sensor_type: sensor_type.to_string(),
            entity_category: None,
            default_enabled: false,
        }
    }

    /// Sets the device class.
    pub fn with_device_class(mut self, class: &str) -> Self {
        self.device_class = Some(class.to_string());
        self
    }

    /// Sets the state class.
    pub fn with_state_class(mut self, class: &str) -> Self {
        self.state_class = Some(class.to_string());
        self
    }

    /// Sets the unit of measurement.
    pub fn with_unit(mut self, unit: &str) -> Self {
        self.unit = Some(unit.to_string());
        self
    }

    /// Sets the entity category.
    pub fn with_entity_category(mut self, category: &str) -> Self {
        self.entity_category = Some(category.to_string());
        self
    }

    /// Sets whether the sensor is enabled by default.
    pub fn with_default_enabled(mut self, enabled: bool) -> Self {
        self.default_enabled = enabled;
        self
    }
}

impl SensorReading {
    /// Creates a new sensor reading.
    pub fn new(id: &str, state: SensorValue) -> Self {
        Self {
            id: id.to_string(),
            state,
            attributes: None,
        }
    }

    /// Adds attributes to the reading.
    pub fn with_attributes(mut self, attributes: serde_json::Value) -> Self {
        self.attributes = Some(attributes);
        self
    }
}
