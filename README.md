# AI_Travel_App

A smart AI-powered travel and mobility application built using **React Native + Expo** that provides:

- 🌦 Real-time Weather Updates
- 🌫 Air Quality Index (AQI) Monitoring
- 🗺 Interactive Maps & Location Tracking
- 🚶 AI-Based Travel Pattern Prediction (ATP)
- 📍 Route Visualization & Journey Analytics
- 📊 ML-Based Transport Mode Classification
- 📑 Travel Reports & Dashboard
- 🔥 Firebase Integration
- 📱 Cross-platform Mobile Support

This project combines **Machine Learning**, **Location Intelligence**, and **Mobile Development** to create an intelligent transportation and travel assistant.

---

# 📌 Features

## 🌍 Real-Time Location Tracking
- Uses Expo Location APIs
- Live GPS tracking
- Distance calculation using Haversine Formula
- Journey path visualization on maps

## 🌦 Weather Monitoring
- Real-time weather information
- Forecast data
- Temperature & condition visualization
- OpenWeatherMap API integration

## 🌫 Air Quality Index (AQI)
- AQI status monitoring
- Forecasted AQI values
- Health-based AQI labels
- Dynamic AQI color indicators

## 🧠 AI Travel Pattern Prediction (ATP)
- Detects movement patterns
- Journey classification
- Transport mode prediction
- Anomaly detection
- KNN-based travel mode analytics

## 📊 Machine Learning Module
Implemented models:
- Decision Tree
- K-Nearest Neighbors (KNN)
- Support Vector Machine (SVM)

Includes:
- Accuracy comparison
- Confusion matrix visualization
- Feature importance analysis

## 🗺 Map Features
- Interactive maps using React Native Maps
- Markers & polylines
- Journey path tracking
- Geo-location services

## 🔐 Firebase Integration
- Firebase Authentication
- Firestore Database
- Cloud storage support

## 📑 Reports & Sharing
- PDF report generation
- Export & sharing functionality
- Travel analytics dashboard

---

# 🛠 Tech Stack

## Frontend
- React Native
- Expo
- React Navigation

## Backend / Services
- Firebase
- Firestore

## APIs Used
- OpenWeatherMap API
- Geoapify API
- AQI API

## Machine Learning
- Python
- Scikit-learn
- Pandas
- NumPy
- Matplotlib

---

# ⚙️ Installation

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/your-username/natpac-travel-app.git
cd natpac-travel-app
```

---

## 2️⃣ Install Dependencies

```bash
npm install
```

---

## 3️⃣ Start the Expo Server

```bash
npx expo start
```

---

# 📱 Run on Device

### Android
```bash
npx expo start --android
```

### iOS
```bash
npx expo start --ios
```

### Web
```bash
npx expo start --web
```

---

# 🔑 Environment & API Setup

Replace the API keys inside the project with your own:

```js
const WEATHER_API_KEY = "YOUR_KEY";
const GEOAPIFY_API_KEY = "YOUR_KEY";
const AIR_API_KEY = "YOUR_KEY";
```

Also configure Firebase:

```js
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
};
```

---

# 🤖 Machine Learning Module

The ML pipeline:
- Loads travel dataset
- Detects target column automatically
- Trains multiple classifiers
- Compares model accuracy
- Generates confusion matrices
- Displays feature importance

## Run ML Script

```bash
python MLTraining.py
```

---

# 📸 App Screens

- Home Dashboard
- Weather Screen
- AQI Monitoring
- ATP Analytics
- Route Visualization
- Admin Dashboard

---

# 📈 Future Enhancements

- 🚦 Smart Traffic Prediction
- 🧠 Deep Learning Models
- 📡 Real-time IoT Sensor Integration
- 🚌 Public Transport Prediction
- 🔔 Smart Notifications
- ☁ Cloud-based Analytics
- 🧭 AI Route Optimization

---

# 🧪 Dependencies

Main dependencies include:

- React Native
- Expo
- Firebase
- React Navigation
- React Native Maps
- Axios
- Expo Location
- Expo Sensors
- Async Storage
- React Native Paper

---

# 👨‍💻 Authors

Developed as an AI-powered smart travel and transportation project.

---

# 📄 License

This project is licensed under the **0BSD License**.

---

# ⭐ Acknowledgements

- Expo
- React Native
- Firebase
- OpenWeatherMap
- Geoapify
- Scikit-learn

---

# 📌 References

Project files and configurations referenced from:

- package.json :contentReference[oaicite:0]{index=0}
- App.js :contentReference[oaicite:1]{index=1}
- ATP_Screen.js :contentReference[oaicite:2]{index=2}
- MLTraining.py :contentReference[oaicite:3]{index=3}
- firebaseConfig.js :contentReference[oaicite:4]{index=4}
