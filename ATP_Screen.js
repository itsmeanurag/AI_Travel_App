// ATP_Screen.js - Advanced ATPv4
// Features: ML-like classifier, dashboard, anomalies, gamification, privacy, project report
// Expo Go friendly: foreground-only, no TaskManager/Notifications used at runtime.

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Share,
  Switch,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { FontAwesome5 } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapView, { Marker, Polyline } from "react-native-maps";
import axios from "axios";

// ---------- Helpers ----------
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const STORAGE_KEY = "travel_history_v1";
const SETTINGS_KEY = "travel_settings_v1";
const KNN_MODEL_KEY = "travel_knn_model_v1"; // NEW: store KNN training data

// Dark map style for Google Maps
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1f2933" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#e5e7eb" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111827" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#111827" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#374151" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f172a" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#020617" }],
  },
];

// ---------- ML helpers (trip-level analytics) ----------

// Build a feature vector from a trip for ML models
// Features: [distance_km, avgSpeed_kmh, duration_min, start_hour]
const buildFeatureFromTrip = (trip) => {
  const distance = trip.distance || 0;
  const avgSpeed = trip.avgSpeed || 0;
  const duration = trip.durationMinutes || 0;

  let hour = 12;
  if (trip.startTimeISO) {
    hour = new Date(trip.startTimeISO).getHours();
  } else if (trip.date) {
    hour = new Date(trip.date).getHours();
  }

  return [distance, avgSpeed, duration, hour];
};

// Simple heuristic model: predict mode from avgSpeed only (baseline)
const heuristicPredictModeFromTrip = (trip) => {
  const v = trip.avgSpeed || 0; // km/h
  if (v < 1.5) return "stationary";
  if (v < 6) return "walking";
  if (v < 40) return "vehicle";
  // high speed: treat as vehicle-type
  return "vehicle";
};

// Euclidean distance for KNN
const knnDistance = (a, b) => {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
};

// KNN prediction for a single feature vector
const knnPredict = (x, dataset, k = 3) => {
  if (!dataset || dataset.length === 0) return "unknown";

  const distances = dataset.map((item) => ({
    label: item.label,
    d: knnDistance(x, item.features),
  }));

  distances.sort((a, b) => a.d - b.d);
  const kEff = Math.min(k, distances.length);
  const votes = {};
  for (let i = 0; i < kEff; i++) {
    const lab = distances[i].label || "unknown";
    votes[lab] = (votes[lab] || 0) + 1;
  }
  let bestLabel = "unknown";
  let bestCount = -1;
  Object.entries(votes).forEach(([lab, cnt]) => {
    if (cnt > bestCount) {
      bestCount = cnt;
      bestLabel = lab;
    }
  });
  return bestLabel;
};

// Build KNN training dataset from trip history
const trainKNNFromHistory = (history) => {
  if (!history || history.length === 0) return [];
  const dataset = history.map((trip) => ({
    features: buildFeatureFromTrip(trip),
    label: trip.mode || "unknown",
  }));
  return dataset;
};

// Evaluate models (heuristic vs KNN) on trip history using leave-one-out for KNN
const evaluateModelsOnHistory = (history) => {
  if (!history || history.length === 0) {
    return {
      heuristic: { correct: 0, total: 0, accuracy: 0 },
      knn: { correct: 0, total: 0, accuracy: 0 },
      perTripLines: [],
    };
  }

  let hCorrect = 0;
  let hTotal = 0;
  let kCorrect = 0;
  let kTotal = 0;

  const perTripLines = [];

  history.forEach((trip, idx) => {
    const trueLabel = trip.mode || "unknown";
    const feat = buildFeatureFromTrip(trip);

    // Heuristic prediction
    const hPred = heuristicPredictModeFromTrip(trip);
    if (trueLabel && trueLabel !== "unknown") {
      hTotal += 1;
      if (hPred === trueLabel) hCorrect += 1;
    }

    // KNN leave-one-out: use all trips except this index as training
    const trainSet = history
      .filter((_, j) => j !== idx)
      .map((t) => ({
        features: buildFeatureFromTrip(t),
        label: t.mode || "unknown",
      }));

    let kPred = "unknown";
    if (trainSet.length > 0) {
      kPred = knnPredict(feat, trainSet, 3);
      if (trueLabel && trueLabel !== "unknown") {
        kTotal += 1;
        if (kPred === trueLabel) kCorrect += 1;
      }
    }

    perTripLines.push(
      `Trip ${idx + 1} | True: ${trueLabel} | Heuristic: ${hPred} | KNN: ${kPred}`
    );
  });

  const hAcc = hTotal > 0 ? hCorrect / hTotal : 0;
  const kAcc = kTotal > 0 ? kCorrect / kTotal : 0;

  return {
    heuristic: { correct: hCorrect, total: hTotal, accuracy: hAcc },
    knn: { correct: kCorrect, total: kTotal, accuracy: kAcc },
    perTripLines,
  };
};

export default function ATPScreen({ route, navigation }) {
  // ---------- State ----------
  const [currentMode, setCurrentMode] = useState("unknown");
  const [modeConfidence, setModeConfidence] = useState(0); // 0–1
  const [movementStatusText, setMovementStatusText] = useState("Acquiring GPS...");
  const [movementStatusIcon, setMovementStatusIcon] = useState("satellite-dish");
  const [anomalyText, setAnomalyText] = useState("");
  const [haltedPlaces, setHaltedPlaces] = useState([]);
  const [isSosVisible, setIsSosVisible] = useState(false);
  const [sosCountdown, setSosCountdown] = useState(15);
  const [currentRegion, setCurrentRegion] = useState(null);
  const [roadType, setRoadType] = useState("N/A");
  const [journeyPath, setJourneyPath] = useState([]);
  const [journeyClassification, setJourneyClassification] = useState(
    "Analysis Pending..."
  );
  const [hasStableGps, setHasStableGps] = useState(false);
  const [recentTrips, setRecentTrips] = useState([]);
  const [isManualOverride, setIsManualOverride] = useState(false);

  const [journeyStartTime, setJourneyStartTime] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  const [accelData, setAccelData] = useState({ x: 0, y: 0, z: 0 });
  const [dashboardStats, setDashboardStats] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [currentAnomalies, setCurrentAnomalies] = useState([]);

  // Privacy settings
  const [saveHistoryEnabled, setSaveHistoryEnabled] = useState(true);
  const [maskCoords, setMaskCoords] = useState(false);

  const accelHistoryRef = useRef([]);
  const sosTimerRef = useRef(null);
  const locationSubscription = useRef(null);
  const stopAnalysisTimer = useRef(null);
  const lastApiCallTimestamp = useRef(0);
  const lastSpeedRef = useRef(0);

  const { apiKey } = route?.params || {};
  const geoApiKey = apiKey || "cdd25e128003407b8c836581f3bea685";

  // ---------- Geo helpers ----------
  const getCityFromCoords = async (lat, lon) => {
    if (!hasStableGps) return "Unknown";
    const url = `https://api.geoapify.com/v1/revgeocode?lat=${lat}&lon=${lon}&apiKey=${geoApiKey}`;
    try {
      const res = await axios.get(url);
      const props = res.data?.features?.[0]?.properties;
      return (
        props?.city ||
        props?.county ||
        props?.state ||
        props?.country ||
        "Unknown"
      );
    } catch (e) {
      console.log("City lookup error", e?.message);
      return "Unknown";
    }
  };

  const updateContextualData = async (lat, lon) => {
    if (!hasStableGps || typeof lat !== "number" || typeof lon !== "number")
      return;

    const now = Date.now();
    if (now - lastApiCallTimestamp.current < 10000) return;
    lastApiCallTimestamp.current = now;

    const roadUrl = `https://api.geoapify.com/v1/revgeocode?lat=${lat}&lon=${lon}&apiKey=${geoApiKey}`;
    try {
      const res = await axios.get(roadUrl);
      const props = res.data?.features?.[0]?.properties;
      if (props) {
        setRoadType(
          props.street || props.road || props.name || props.suburb || "Unknown road"
        );
      }
    } catch (e) {
      console.log("Road lookup error", e?.message);
      setRoadType("API Error");
    }
  };

  const analyzeStop = async ({ lat, lon }) => {
    const url = `https://api.geoapify.com/v2/places?categories=catering&filter=circle:${lon},${lat},120&limit=1&apiKey=${geoApiKey}`;
    try {
      const res = await axios.get(url);
      const place = res.data?.features?.[0]?.properties;
      if (place) {
        const haltReason = `Halted near ${
          place.name || place.address_line1 || "a place"
        }.`;
        setHaltedPlaces((prev) => {
          const next = [...prev];
          if (!next.includes(haltReason)) {
            next.unshift(haltReason);
            return next.slice(0, 6);
          }
          return prev;
        });
      }
    } catch (e) {
      console.log("Stop analyze error", e?.message);
    }
  };

  // ---------- ML-like classifier ----------
  const computeAccelStd = () => {
    const mags = accelHistoryRef.current;
    if (!mags || mags.length < 5) return { std: 0, mean: 0 };
    const n = mags.length;
    const mean =
      mags.reduce((sum, v) => sum + v, 0) / (n === 0 ? 1 : n);
    const variance =
      mags.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) /
      (n === 0 ? 1 : n);
    const std = Math.sqrt(variance);
    return { std, mean };
  };

  // Simple 3-class "logistic regression" style classifier
  const classifyModeML = (speed, accelStd) => {
    // features: [1, speed, accelStd]
    const f0 = 1;
    const f1 = speed; // m/s
    const f2 = accelStd;

    // Weights chosen to behave reasonably; can be fit from real data offline.
    const weights = {
      stationary: { w0: 2.0, w1: -1.8, w2: -3.0 },
      walking: { w0: -0.5, w1: 0.5, w2: 3.0 },
      vehicle: { w0: -1.5, w1: 1.8, w2: -0.8 },
    };

    const score = (w) => w.w0 * f0 + w.w1 * f1 + w.w2 * f2;

    const sStationary = score(weights.stationary);
    const sWalking = score(weights.walking);
    const sVehicle = score(weights.vehicle);

    const maxS = Math.max(sStationary, sWalking, sVehicle);
    const eStationary = Math.exp(sStationary - maxS);
    const eWalking = Math.exp(sWalking - maxS);
    const eVehicle = Math.exp(sVehicle - maxS);
    const sumE = eStationary + eWalking + eVehicle;

    const pStationary = eStationary / sumE;
    const pWalking = eWalking / sumE;
    const pVehicle = eVehicle / sumE;

    const probs = {
      stationary: pStationary,
      walking: pWalking,
      vehicle: pVehicle,
    };

    let bestMode = "stationary";
    let bestProb = pStationary;
    if (pWalking > bestProb) {
      bestMode = "walking";
      bestProb = pWalking;
    }
    if (pVehicle > bestProb) {
      bestMode = "vehicle";
      bestProb = pVehicle;
    }

    return { mode: bestMode, probs, confidence: bestProb };
  };

  const updateCurrentMode = (mode, confidence) => {
    if (!isManualOverride) {
      setCurrentMode(mode);
      if (confidence != null) setModeConfidence(confidence);
    }
  };

  // ---------- Anomaly logging ----------
  const logAnomaly = (msg) => {
    setCurrentAnomalies((prev) => {
      if (prev.includes(msg)) return prev;
      return [...prev, msg];
    });
    setAnomalyText(msg);
  };

  // ---------- Movement / GPS ----------
  const analyzeMovement = (location) => {
    if (!location?.coords) return;

    const { latitude, longitude, speed = 0 } = location.coords;
    const speedMs = speed || 0;

    if (!hasStableGps && latitude && longitude) {
      setHasStableGps(true);
    }

    if (!journeyStartTime) {
      setJourneyStartTime(new Date().toISOString());
    }

    setCurrentRegion({
      latitude,
      longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    });

    setJourneyPath((prev) => {
      const last = prev[prev.length - 1];
      if (
        !last ||
        Math.abs(last.latitude - latitude) > 0.00003 ||
        Math.abs(last.longitude - longitude) > 0.00003
      ) {
        return [...prev, { latitude, longitude }];
      }
      return prev;
    });

    if (speedMs > 0.3) {
      setMovementStatusText(`Moving at ${speedMs.toFixed(1)} m/s`);
      setMovementStatusIcon("tachometer-alt");
    } else {
      setMovementStatusText("Stationary");
      setMovementStatusIcon("hand-paper");
    }

    const { std: accelStd } = computeAccelStd();
    const { mode, confidence } = classifyModeML(speedMs, accelStd);
    if (!isManualOverride) {
      updateCurrentMode(mode, confidence);
    }

    // Anomaly: overspeed ( > 30 m/s ~ 108 km/h )
    if (speedMs > 30) {
      logAnomaly(
        `Overspeed event detected (~${(speedMs * 3.6).toFixed(0)} km/h).`
      );
    }

    // Anomaly: sudden stop from high speed
    if (lastSpeedRef.current > 8 && speedMs < 0.5 && accelStd > 0.08) {
      logAnomaly("Sudden stop detected. Check for possible incident.");
    }
    lastSpeedRef.current = speedMs;

    updateContextualData(latitude, longitude);

    if (mode === "stationary") {
      if (!stopAnalysisTimer.current) {
        stopAnalysisTimer.current = setTimeout(() => {
          analyzeStop({ lat: latitude, lon: longitude });
          stopAnalysisTimer.current = null;
        }, 15000);
      }
    } else {
      if (stopAnalysisTimer.current) {
        clearTimeout(stopAnalysisTimer.current);
        stopAnalysisTimer.current = null;
      }
    }

    // Future: send location to server (for EAS build)
    // sendLocationToServer(location);
  };

  // ---------- SOS ----------
  const startSosSequence = () => {
    setIsSosVisible(true);
    setSosCountdown(15);
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);

    sosTimerRef.current = setInterval(() => {
      setSosCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(sosTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSosSequence = () => {
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);
    setIsSosVisible(false);
    setSosCountdown(15);
  };

  // ---------- History & Analytics ----------
  const computeDashboardFromHistory = (history) => {
    if (!history || history.length === 0) return null;

    let totalDistance = 0;
    let totalTrips = history.length;
    const modeTime = {};
    const placeCount = {};
    const routeCount = {};
    let longestTrip = null;
    let maxDistance = 0;
    let maxAvgSpeedTrip = null;
    let maxAvgSpeed = 0;

    history.forEach((trip) => {
      totalDistance += trip.distance || 0;

      if (trip.durationMinutes) {
        const t = trip.durationMinutes;
        const m = trip.mode || "unknown";
        modeTime[m] = (modeTime[m] || 0) + t;
      }

      // frequent places: round coords
      const startKey =
        trip.start && trip.start.lat != null && trip.start.lon != null
          ? `${trip.start.lat.toFixed(3)},${trip.start.lon.toFixed(3)}`
          : null;
      const endKey =
        trip.end && trip.end.lat != null && trip.end.lon != null
          ? `${trip.end.lat.toFixed(3)},${trip.end.lon.toFixed(3)}`
          : null;

      if (startKey) {
        placeCount[startKey] = (placeCount[startKey] || 0) + 1;
      }

      if (startKey && endKey) {
        const routeKey = `${startKey} -> ${endKey}`;
        routeCount[routeKey] = (routeCount[routeKey] || 0) + 1;
      }

      if (trip.distance > maxDistance) {
        maxDistance = trip.distance;
        longestTrip = trip;
      }

      if (trip.avgSpeed > maxAvgSpeed) {
        maxAvgSpeed = trip.avgSpeed;
        maxAvgSpeedTrip = trip;
      }
    });

    const topPlaces = Object.entries(placeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count], idx) => ({
        id: key,
        label:
          idx === 0 ? "Most visited" : idx === 1 ? "Second most" : "Frequent",
        coord: key,
        count,
      }));

    const topRouteEntry = Object.entries(routeCount).sort(
      (a, b) => b[1] - a[1]
    )[0];

    const topRoute =
      topRouteEntry && topRouteEntry.length > 0
        ? { route: topRouteEntry[0], count: topRouteEntry[1] }
        : null;

    // Achievements
    const badges = [];
    if (totalDistance >= 10) badges.push("Walker – 10+ km tracked");
    if (totalDistance >= 50) badges.push("Traveler – 50+ km total");
    if (totalDistance >= 100) badges.push("Globetrotter – 100+ km total");

    // Streaks (approx): count distinct dates
    const dateSet = new Set();
    history.forEach((trip) => {
      if (trip.date) {
        const d = new Date(trip.date);
        const key = d.toDateString();
        dateSet.add(key);
      }
    });
    const daysTracked = dateSet.size;
    if (daysTracked >= 3) badges.push("Consistency – tracked 3+ days");
    if (daysTracked >= 7) badges.push("Weekly streak – 7+ days tracked");

    return {
      totalTrips,
      totalDistance: Number(totalDistance.toFixed(2)),
      modeTime,
      topPlaces,
      topRoute,
      longestTrip,
      maxAvgSpeedTrip,
      badges,
    };
  };

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const obj = JSON.parse(saved);
        if (typeof obj.saveHistoryEnabled === "boolean") {
          setSaveHistoryEnabled(obj.saveHistoryEnabled);
        }
        if (typeof obj.maskCoords === "boolean") {
          setMaskCoords(obj.maskCoords);
        }
      }
    } catch (e) {
      console.log("Settings load error", e?.message);
    }
  };

  const persistSettings = async (newValues) => {
    try {
      const current = {
        saveHistoryEnabled,
        maskCoords,
        ...newValues,
      };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    } catch (e) {
      console.log("Settings save error", e?.message);
    }
  };

  const loadHistory = async () => {
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEY);
      if (existing) {
        const hist = JSON.parse(existing);
        setRecentTrips(hist);
        const stats = computeDashboardFromHistory(hist);
        setDashboardStats(stats);
        setAchievements(stats?.badges || []);
      }
    } catch (e) {
      console.log("History load error", e?.message);
    }
  };

    // ---------- Demo data: Vadodara sample trips ----------
  const loadDemoVadodaraData = async () => {
    try {
      const now = new Date();
      const makeTime = (daysAgo, hour, min) => {
        const d = new Date(now);
        d.setDate(d.getDate() - daysAgo);
        d.setHours(hour, min, 0, 0);
        return d;
      };

      // Approximate Vadodara coordinates & realistic trips
      // Trip 1 – Home (Akota) → MSU (college) by vehicle
      const s1 = makeTime(3, 8, 45);
      const e1 = makeTime(3, 9, 5);
      const trip1 = {
        id: Date.now() + 1,
        date: e1.toLocaleString(),
        distance: 5.4,              // km
        avgSpeed: 16.2,             // km/h
        durationMinutes: 20.0,
        mode: "vehicle",
        start: { lat: 22.2905, lon: 73.1645 }, // Akota area
        end: { lat: 22.3015, lon: 73.1812 },   // MSU / Sayajigunj area
        startTimeISO: s1.toISOString(),
        endTimeISO: e1.toISOString(),
      };

      // Trip 2 – Walking inside Sayaji Baug
      const s2 = makeTime(3, 18, 10);
      const e2 = makeTime(3, 18, 30);
      const trip2 = {
        id: Date.now() + 2,
        date: e2.toLocaleString(),
        distance: 1.3,
        avgSpeed: 3.9,
        durationMinutes: 20.0,
        mode: "walking",
        start: { lat: 22.3072, lon: 73.1800 },
        end: { lat: 22.3078, lon: 73.1765 },
        startTimeISO: s2.toISOString(),
        endTimeISO: e2.toISOString(),
      };

      // Trip 3 – Bus: Vadodara Railway Station → Manjalpur
      const s3 = makeTime(2, 9, 15);
      const e3 = makeTime(2, 9, 45);
      const trip3 = {
        id: Date.now() + 3,
        date: e3.toLocaleString(),
        distance: 7.1,
        avgSpeed: 14.2,
        durationMinutes: 30.0,
        mode: "bus",
        start: { lat: 22.3106, lon: 73.1810 }, // Railway station
        end: { lat: 22.2705, lon: 73.1902 },   // Manjalpur
        startTimeISO: s3.toISOString(),
        endTimeISO: e3.toISOString(),
      };

      // Trip 4 – Short vehicle trip: Alkapuri → Fatehgunj
      const s4 = makeTime(1, 19, 5);
      const e4 = makeTime(1, 19, 18);
      const trip4 = {
        id: Date.now() + 4,
        date: e4.toLocaleString(),
        distance: 3.2,
        avgSpeed: 14.8,
        durationMinutes: 13.0,
        mode: "vehicle",
        start: { lat: 22.3100, lon: 73.1805 }, // Alkapuri
        end: { lat: 22.3201, lon: 73.1825 },   // Fatehgunj
        startTimeISO: s4.toISOString(),
        endTimeISO: e4.toISOString(),
      };

      // Trip 5 – Morning walk: residential Gotri area
      const s5 = makeTime(1, 6, 45);
      const e5 = makeTime(1, 7, 5);
      const trip5 = {
        id: Date.now() + 5,
        date: e5.toLocaleString(),
        distance: 1.0,
        avgSpeed: 3.0,
        durationMinutes: 20.0,
        mode: "walking",
        start: { lat: 22.3105, lon: 73.1505 },
        end: { lat: 22.3130, lon: 73.1475 },
        startTimeISO: s5.toISOString(),
        endTimeISO: e5.toISOString(),
      };

      // Trip 6 – Longer vehicle trip: Vadodara → Anand side (highway)
      const s6 = makeTime(4, 15, 0);
      const e6 = makeTime(4, 15, 50);
      const trip6 = {
        id: Date.now() + 6,
        date: e6.toLocaleString(),
        distance: 32.0,
        avgSpeed: 38.4,
        durationMinutes: 50.0,
        mode: "vehicle",
        start: { lat: 22.3106, lon: 73.1810 }, // Vadodara station/highway start
        end: { lat: 22.5530, lon: 72.9550 },   // towards Anand/Nadiad side
        startTimeISO: s6.toISOString(),
        endTimeISO: e6.toISOString(),
      };

      const demoTrips = [trip1, trip2, trip3, trip4, trip5, trip6];

      // Save to storage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(demoTrips));

      // Update in-memory state & dashboard
      setRecentTrips(demoTrips);
      const stats = computeDashboardFromHistory(demoTrips);
      setDashboardStats(stats);
      setAchievements(stats?.badges || []);

      Alert.alert(
        "Demo data loaded",
        "Sample Vadodara travel history has been added for presentation."
      );
    } catch (e) {
      console.log("Demo data load error", e?.message);
      Alert.alert("Error", "Failed to load demo data.");
    }
  };

  const saveCompletedJourney = async () => {
    try {
      if (!saveHistoryEnabled) return;
      if (journeyPath.length < 5) return;

      const startPoint = journeyPath[0];
      const endPoint = journeyPath[journeyPath.length - 1];

      const totalDistance = getDistanceFromLatLonInKm(
        startPoint.latitude,
        startPoint.longitude,
        endPoint.latitude,
        endPoint.longitude
      );

      let durationMs;
      let startTimeObj = journeyStartTime
        ? new Date(journeyStartTime)
        : null;
      const now = new Date();
      if (startTimeObj) {
        durationMs = now.getTime() - startTimeObj.getTime();
      } else {
        durationMs = Math.max(1, (journeyPath.length - 1) * 3000);
        startTimeObj = new Date(now.getTime() - durationMs);
      }
      const durationMinutes = durationMs / 60000;
      const hours = durationMs / 3600000;
      const avgSpeed = hours > 0 ? totalDistance / hours : 0;
      const mode = currentMode;

      const newEntry = {
        id: Date.now(),
        date: now.toLocaleString(),
        distance: Number(totalDistance.toFixed(2)),
        avgSpeed: Number(avgSpeed.toFixed(1)),
        durationMinutes: Number(durationMinutes.toFixed(1)),
        mode,
        start: {
          lat: startPoint.latitude,
          lon: startPoint.longitude,
        },
        end: {
          lat: endPoint.latitude,
          lon: endPoint.longitude,
        },
        startTimeISO: startTimeObj.toISOString(),
        endTimeISO: now.toISOString(),
      };

      const existing = await AsyncStorage.getItem(STORAGE_KEY);
      let history = existing ? JSON.parse(existing) : [];
      history.unshift(newEntry);
      history = history.slice(0, 20);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      setRecentTrips(history);
      const stats = computeDashboardFromHistory(history);
      setDashboardStats(stats);
      setAchievements(stats?.badges || []);
    } catch (e) {
      console.log("History save error", e?.message);
    }
  };

  const analyzeCompletedJourney = async () => {
    try {
      if (journeyPath.length < 20) {
        setJourneyClassification("Trip too short to classify.");
        return;
      }
      const startPoint = journeyPath[0];
      const endPoint = journeyPath[journeyPath.length - 1];

      const totalDistance = getDistanceFromLatLonInKm(
        startPoint.latitude,
        startPoint.longitude,
        endPoint.latitude,
        endPoint.longitude
      );

      const startCity = await getCityFromCoords(
        startPoint.latitude,
        startPoint.longitude
      );
      const endCity = await getCityFromCoords(
        endPoint.latitude,
        endPoint.longitude
      );

      if (totalDistance > 50 && startCity !== endCity) {
        setJourneyClassification(
          `Long-Distance Travel (${startCity} → ${endCity})`
        );
      } else {
        setJourneyClassification(`Local Commute in ${startCity}`);
      }
    } catch (e) {
      console.log("Journey analyze error", e?.message);
    }
  };

  // ---------- Trip Summary ----------
  const handleEndTrip = async () => {
    if (journeyPath.length < 5) {
      Alert.alert("Trip too short", "Move a bit more before ending the trip.");
      return;
    }

    const startPoint = journeyPath[0];
    const endPoint = journeyPath[journeyPath.length - 1];
    const totalDistance = getDistanceFromLatLonInKm(
      startPoint.latitude,
      startPoint.longitude,
      endPoint.latitude,
      endPoint.longitude
    );

    let durationMs;
    let startTimeObj = journeyStartTime
      ? new Date(journeyStartTime)
      : null;
    const now = new Date();
    if (startTimeObj) {
      durationMs = now.getTime() - startTimeObj.getTime();
    } else {
      durationMs = Math.max(1, (journeyPath.length - 1) * 3000);
      startTimeObj = new Date(now.getTime() - durationMs);
    }
    const durationMinutes = durationMs / 60000;
    const hours = durationMs / 3600000;
    const avgSpeed = hours > 0 ? totalDistance / hours : 0;

    // Route-geometry anomaly: detour factor
    const straightLine = getDistanceFromLatLonInKm(
      startPoint.latitude,
      startPoint.longitude,
      endPoint.latitude,
      endPoint.longitude
    );
    if (straightLine > 0 && totalDistance / straightLine > 1.8) {
      logAnomaly("Unusual route pattern (many detours).");
    }

    const summary = {
      distance: Number(totalDistance.toFixed(2)),
      avgSpeed: Number(avgSpeed.toFixed(1)),
      durationMinutes: Number(durationMinutes.toFixed(1)),
      mode: currentMode,
      haltedPlaces: [...haltedPlaces],
      startTime: startTimeObj.toLocaleString(),
      endTime: now.toLocaleString(),
      path: [...journeyPath],
      anomalies: [...currentAnomalies],
      modeConfidence: modeConfidence,
    };

    setSummaryData(summary);
    setShowSummary(true);

    await saveCompletedJourney();
    await analyzeCompletedJourney();
  };

  const exportTripAsCSV = async () => {
    if (!summaryData) {
      Alert.alert("No trip summary", "End a trip first to generate summary.");
      return;
    }
    const s = summaryData;
    const headers = "metric,value\n";
    const rows = [
      ["Distance (km)", s.distance.toFixed(2)],
      ["Average Speed (km/h)", s.avgSpeed.toFixed(1)],
      ["Duration (min)", s.durationMinutes.toFixed(1)],
      ["Mode", s.mode],
      ["Confidence", (s.modeConfidence * 100).toFixed(0) + "%"],
      ["Stops Count", s.haltedPlaces.length.toString()],
      ["Start Time", s.startTime],
      ["End Time", s.endTime],
    ];
    const csv = headers + rows.map((r) => r.join(",")).join("\n");

    try {
      await Share.share({
        title: "Trip Summary CSV",
        message: csv,
      });
    } catch (e) {
      console.log("CSV share error", e?.message);
    }
  };

  const exportTripAsTextReport = async () => {
    if (!summaryData) {
      Alert.alert("No trip summary", "End a trip first to generate summary.");
      return;
    }
    const s = summaryData;
    const report = `
Trip Summary Report

Start Time : ${s.startTime}
End Time   : ${s.endTime}
Mode       : ${s.mode} (confidence ${(s.modeConfidence * 100).toFixed(0)}%)

Distance   : ${s.distance.toFixed(2)} km
Avg Speed  : ${s.avgSpeed.toFixed(1)} km/h
Duration   : ${s.durationMinutes.toFixed(1)} minutes

Stops:
${s.haltedPlaces.length === 0 ? "- None" : s.haltedPlaces.map((h) => "- " + h).join("\n")}

Anomalies Detected:
${s.anomalies.length === 0 ? "- None" : s.anomalies.map((a) => "- " + a).join("\n")}
`.trim();

    try {
      await Share.share({
        title: "Trip Summary Report",
        message: report,
      });
    } catch (e) {
      console.log("Report share error", e?.message);
    }
  };

  // ---------- ML Analytics Report & Iterative Training ----------
const exportMLAnalyticsReportAndTrain = async () => {
  if (!recentTrips || recentTrips.length < 3) {
    Alert.alert(
      "Not enough data",
      "Track at least 3 trips before generating the ML analytics report."
    );
    return;
  }

  // 1) Build dataset & train KNN
  const dataset = trainKNNFromHistory(recentTrips);

  // 2) Evaluate models
  const evalRes = evaluateModelsOnHistory(recentTrips);
  const h = evalRes.heuristic;
  const k = evalRes.knn;

  // 3) Persist KNN dataset for future use (iterative training)
  try {
    await AsyncStorage.setItem(KNN_MODEL_KEY, JSON.stringify(dataset));
  } catch (e) {
    console.log("Failed to save KNN model", e?.message);
  }

  // 4) Build a detailed report (tables + ASCII-style graphs)
  const lines = [];

  lines.push("Automatic Travel Profiler – ML Analytics Report\n");

  // Model comparison table
  lines.push("Model Comparison (using trip-level labels)\n");
  lines.push("Model,Correct,Total,Accuracy (%)");
  lines.push(
    `HeuristicSpeedModel,${h.correct},${h.total},${(h.accuracy * 100).toFixed(
      1
    )}`
  );
  lines.push(
    `KNNPatternModel,${k.correct},${k.total},${(k.accuracy * 100).toFixed(1)}`
  );

  // Simple ASCII "graph" of accuracy
  const hBar = "#".repeat(Math.round(h.accuracy * 20));
  const kBar = "#".repeat(Math.round(k.accuracy * 20));
  lines.push("\nAccuracy Graph (each # ≈ 5%)");
  lines.push(`Heuristic: [${hBar}] ${(h.accuracy * 100).toFixed(1)}%`);
  lines.push(`KNN      : [${kBar}] ${(k.accuracy * 100).toFixed(1)}%`);

  // Mode distribution graph from history
  const modeCounts = {};
  recentTrips.forEach((trip) => {
    const m = trip.mode || "unknown";
    modeCounts[m] = (modeCounts[m] || 0) + 1;
  });
  lines.push("\nMode Distribution (trip counts):");
  Object.entries(modeCounts).forEach(([m, c]) => {
    const bar = "#".repeat(c);
    lines.push(`${m.padEnd(10)} : ${bar} (${c})`);
  });

  // Detailed per-trip model outputs
  lines.push("\nPer-trip Predictions:");
  evalRes.perTripLines.forEach((line) => lines.push(line));

  // Trip feature table (sorted by date descending)
  lines.push("\nTrip Feature Table (latest first):");
  lines.push(
    "Index,Date,Mode,Distance_km,AvgSpeed_kmh,Duration_min,StartHour"
  );
  recentTrips.forEach((trip, idx) => {
    const feat = buildFeatureFromTrip(trip);
    const hour = feat[3];
    lines.push(
      [
        idx + 1,
        trip.date || "",
        trip.mode || "unknown",
        (trip.distance || 0).toFixed(2),
        (trip.avgSpeed || 0).toFixed(1),
        (trip.durationMinutes || 0).toFixed(1),
        hour,
      ].join(",")
    );
  });

  lines.push(
    "\nNote: KNN uses [distance_km, avgSpeed_kmh, duration_min, start_hour] as features."
  );
  lines.push(
    "Each new trip and each new report generation updates the training dataset (iterative training)."
  );

  const report = lines.join("\n");

  try {
    await Share.share({
      title: "ML Analytics Report",
      message: report,
    });
  } catch (e) {
    console.log("ML report share error", e?.message);
  }
};

// ---------- Full PDF Report (tables + graphs) ----------
const exportFullPDFReport = async () => {
  if (!recentTrips || recentTrips.length === 0) {
    Alert.alert("No data", "Track or load some trips before exporting PDF.");
    return;
  }

  // Ensure we have stats
  const stats = dashboardStats || computeDashboardFromHistory(recentTrips);
  const evalRes = evaluateModelsOnHistory(recentTrips);
  const h = evalRes.heuristic;
  const k = evalRes.knn;

  // Mode distribution
  const modeCounts = {};
  recentTrips.forEach((trip) => {
    const m = trip.mode || "unknown";
    modeCounts[m] = (modeCounts[m] || 0) + 1;
  });

  // Build HTML pieces
  const modeRowsHtml = Object.entries(modeCounts)
    .map(([m, c]) => {
      const barWidth = Math.min(100, c * 20); // simple bar
      return `
        <tr>
          <td>${m}</td>
          <td style="text-align:center;">${c}</td>
          <td>
            <div style="background:#111827;border-radius:8px;width:100%;height:10px;overflow:hidden;">
              <div style="width:${barWidth}%;height:10px;background:#3B82F6;"></div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  const tripRowsHtml = recentTrips
    .map((trip, idx) => {
      const feat = buildFeatureFromTrip(trip);
      const hour = feat[3];
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${trip.date || ""}</td>
          <td>${trip.mode || "unknown"}</td>
          <td>${(trip.distance || 0).toFixed(2)}</td>
          <td>${(trip.avgSpeed || 0).toFixed(1)}</td>
          <td>${(trip.durationMinutes || 0).toFixed(1)}</td>
          <td>${hour}</td>
        </tr>
      `;
    })
    .join("");

  const perTripLinesHtml = evalRes.perTripLines
    .map((line) => `<li>${line}</li>`)
    .join("");

  const hAcc = (h.accuracy * 100).toFixed(1);
  const kAcc = (k.accuracy * 100).toFixed(1);
  const hWidth = Math.min(100, h.accuracy * 100);
  const kWidth = Math.min(100, k.accuracy * 100);

  const longest = stats?.longestTrip;
  const fastest = stats?.maxAvgSpeedTrip;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Automatic Travel Profiler – Report</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0b1120;
        color: #e5e7eb;
        padding: 16px;
      }
      h1, h2, h3 {
        color: #f9fafb;
      }
      .card {
        border-radius: 12px;
        border: 1px solid #1f2937;
        padding: 12px 16px;
        margin-bottom: 16px;
        background: #020617;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 12px;
      }
      th, td {
        border: 1px solid #374151;
        padding: 4px 6px;
      }
      th {
        background: #111827;
        text-align: left;
      }
      .tag {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        background: #111827;
        font-size: 11px;
        margin-right: 4px;
        margin-top: 4px;
      }
    </style>
  </head>
  <body>
    <h1>Automatic Travel Profiler – Full Report</h1>

    <div class="card">
      <h2>Overview</h2>
      <p><strong>Total Trips:</strong> ${stats?.totalTrips || recentTrips.length}</p>
      <p><strong>Total Distance:</strong> ${(stats?.totalDistance || 0).toFixed(
        2
      )} km</p>
      <p><strong>Time by mode (min):</strong></p>
      <ul>
        ${stats?.modeTime
          ? Object.entries(stats.modeTime)
              .map(
                ([m, t]) =>
                  `<li>${m}: ${t.toFixed(1)} minutes</li>`
              )
              .join("")
          : "<li>No data</li>"}
      </ul>
      ${
        longest
          ? `<p><strong>Longest Trip:</strong> ${longest.distance.toFixed(
              2
            )} km, avg ${longest.avgSpeed.toFixed(1)} km/h</p>`
          : ""
      }
      ${
        fastest
          ? `<p><strong>Fastest Trip (avg speed):</strong> ${fastest.avgSpeed.toFixed(
              1
            )} km/h over ${fastest.distance.toFixed(2)} km</p>`
          : ""
      }
    </div>

    <div class="card">
      <h2>Model Comparison</h2>
      <table>
        <tr>
          <th>Model</th>
          <th>Correct</th>
          <th>Total</th>
          <th>Accuracy (%)</th>
        </tr>
        <tr>
          <td>Heuristic Speed Model</td>
          <td>${h.correct}</td>
          <td>${h.total}</td>
          <td>${hAcc}</td>
        </tr>
        <tr>
          <td>KNN Pattern Model</td>
          <td>${k.correct}</td>
          <td>${k.total}</td>
          <td>${kAcc}</td>
        </tr>
      </table>

      <h3>Accuracy Graph</h3>
      <p>Heuristic (${hAcc}%):</p>
      <div style="background:#111827;border-radius:8px;width:100%;height:12px;overflow:hidden;">
        <div style="width:${hWidth}%;height:12px;background:#22c55e;"></div>
      </div>
      <p>KNN (${kAcc}%):</p>
      <div style="background:#111827;border-radius:8px;width:100%;height:12px;overflow:hidden;">
        <div style="width:${kWidth}%;height:12px;background:#3b82f6;"></div>
      </div>
      <p style="font-size:11px;margin-top:4px;">
        Heuristic uses avg speed rules; KNN uses [distance, avg speed, duration, start hour].
      </p>
    </div>

    <div class="card">
      <h2>Mode Distribution</h2>
      <table>
        <tr>
          <th>Mode</th>
          <th>Trips</th>
          <th>Bar</th>
        </tr>
        ${modeRowsHtml}
      </table>
    </div>

    <div class="card">
      <h2>Per-trip Predictions (Heuristic vs KNN)</h2>
      <ul>
        ${perTripLinesHtml}
      </ul>
    </div>

    <div class="card">
      <h2>Trip Feature Table</h2>
      <table>
        <tr>
          <th>#</th>
          <th>Date</th>
          <th>Mode</th>
          <th>Distance (km)</th>
          <th>Avg Speed (km/h)</th>
          <th>Duration (min)</th>
          <th>Start Hour</th>
        </tr>
        ${tripRowsHtml}
      </table>
      <p style="font-size:11px;margin-top:4px;">
        Features used for KNN: [distance_km, avgSpeed_kmh, duration_min, start_hour].
      </p>
    </div>

    <div class="card">
      <h2>Achievements</h2>
      ${
        stats?.badges && stats.badges.length > 0
          ? stats.badges
              .map((b) => `<span class="tag">${b}</span>`)
              .join("")
          : "<p>No achievements yet.</p>"
      }
    </div>
  </body>
  </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Share ATP Report PDF",
    });
  } catch (e) {
    console.log("PDF report error", e?.message);
    Alert.alert("Error", "Failed to generate PDF report.");
  }
};

  // ---------- Project report (multi-trip) ----------
  const exportProjectReport = async () => {
    if (!dashboardStats || !recentTrips || recentTrips.length === 0) {
      Alert.alert(
        "Not enough data",
        "Track a few trips before generating project report."
      );
      return;
    }

    const d = dashboardStats;
    const lines = [];

    lines.push("Automatic Travel Profiler – Project Report Summary\n");
    lines.push(`Total Trips: ${d.totalTrips}`);
    lines.push(`Total Distance: ${d.totalDistance.toFixed(2)} km`);

    lines.push("\nTime spent by mode (approx):");
    Object.entries(d.modeTime || {}).forEach(([mode, mins]) => {
      lines.push(`- ${mode}: ${mins.toFixed(1)} minutes`);
    });

    if (d.longestTrip) {
      lines.push(
        `\nLongest Trip: ${d.longestTrip.distance.toFixed(
          2
        )} km, avg speed ${d.longestTrip.avgSpeed.toFixed(1)} km/h`
      );
    }
    if (d.maxAvgSpeedTrip) {
      lines.push(
        `Fastest Trip (by avg speed): ${d.maxAvgSpeedTrip.avgSpeed.toFixed(
          1
        )} km/h over ${d.maxAvgSpeedTrip.distance.toFixed(2)} km`
      );
    }

    if (d.topPlaces && d.topPlaces.length > 0 && !maskCoords) {
      lines.push("\nFrequent Places (rounded coordinates):");
      d.topPlaces.forEach((p) => {
        lines.push(`- ${p.label}: ${p.coord} (visits: ${p.count})`);
      });
    }

    if (d.topRoute) {
      lines.push(
        `\nMost common route pattern: ${d.topRoute.route} (${d.topRoute.count} times)`
      );
    }

    if (d.badges && d.badges.length > 0) {
      lines.push("\nAchievements Unlocked:");
      d.badges.forEach((b) => lines.push(`- ${b}`));
    }

    const report = lines.join("\n");

    try {
      await Share.share({
        title: "Travel Profiler Project Report",
        message: report,
      });
    } catch (e) {
      console.log("Project report share error", e?.message);
    }
  };

  // ---------- Manual override ----------
  const handleManualOverride = (mode) => {
    setIsManualOverride(true);
    setCurrentMode(mode);
    setModeConfidence(1.0);
    setAnomalyText(`Mode manually set to ${mode}.`);

    setTimeout(() => {
      setIsManualOverride(false);
      setAnomalyText("");
    }, 8000);
  };

  // ---------- Mode UI ----------
  const getModeUI = (mode) => {
    switch (mode) {
      case "stationary":
        return { text: "Stationary", icon: "pause-circle", color: "#3B82F6" };
      case "walking":
        return { text: "Walking", icon: "walking", color: "#8B5CF6" };
      case "vehicle":
        return { text: "Vehicle", icon: "car", color: "#4F46E5" };
      case "bus":
        return { text: "Bus", icon: "bus-alt", color: "#EF4444" };
      case "train":
        return { text: "Train", icon: "train", color: "#F97316" };
      case "metro":
        return { text: "Metro", icon: "subway", color: "#10B981" };
      default:
        return { text: "Unknown", icon: "question-circle", color: "#6B7280" };
    }
  };

  const { text: modeText, icon: modeIcon, color: modeColor } =
    getModeUI(currentMode);

  // ---------- Effects ----------
  useEffect(() => {
    const startLocationTracking = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location permission is required.");
        setMovementStatusText("Permission Denied");
        setMovementStatusIcon("times-circle");
        return;
      }

      try {
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeout: 7000,
        });
        if (initialLocation?.coords) {
          analyzeMovement(initialLocation);
        }
      } catch (e) {
        Alert.alert(
          "GPS Error",
          "Could not get an initial location. Ensure GPS is enabled."
        );
        setMovementStatusText("GPS Error");
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (loc) => analyzeMovement(loc)
      );
    };

    loadSettings();
    loadHistory();
    startLocationTracking();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      if (stopAnalysisTimer.current) clearTimeout(stopAnalysisTimer.current);
      if (sosTimerRef.current) clearInterval(sosTimerRef.current);
      saveCompletedJourney();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Accelerometer subscription
  useEffect(() => {
    let sub = null;
    const subscribeAccel = async () => {
      try {
        Accelerometer.setUpdateInterval(400);
        sub = Accelerometer.addListener((data) => {
          setAccelData(data);
          const mag = Math.sqrt(
            data.x * data.x + data.y * data.y + data.z * data.z
          );
          const arr = accelHistoryRef.current.slice(-24);
          accelHistoryRef.current = [...arr, mag];
        });
      } catch (e) {
        console.log("Accelerometer error", e?.message);
      }
    };

    subscribeAccel();

    return () => {
      if (sub) sub.remove();
    };
  }, []);

  // ---------- Render ----------
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.v3Header}>
        <Text style={styles.v3HeaderTitle}>Travel Profiler</Text>
        <Text style={styles.v3HeaderSubtitle}>
          Smart mobility analysis & live tracking
        </Text>
      </View>

      {/* Status Row */}
      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.label}>Current Status</Text>
          <View style={[styles.chip, styles.chipGreen]}>
            <FontAwesome5
              name={movementStatusIcon}
              size={14}
              color="#BBF7D0"
              style={{ marginRight: 8 }}
              solid
            />
            <Text style={styles.chipText}>{movementStatusText}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Mode of Movement</Text>
          <View
            style={[
              styles.chip,
              { borderColor: modeColor, backgroundColor: "#020617" },
            ]}
          >
            <FontAwesome5
              name={modeIcon}
              size={14}
              color={modeColor}
              style={{ marginRight: 8 }}
              solid
            />
            <Text style={styles.chipText}>
              {modeText}{" "}
              {modeConfidence > 0
                ? `(${(modeConfidence * 100).toFixed(0)}%)`
                : ""}
            </Text>
          </View>
        </View>
      </View>

      {/* Road & Journey Type */}
      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.label}>Current Road</Text>
          <View style={[styles.chip, styles.chipGray]}>
            <FontAwesome5
              name="road"
              size={14}
              color="#E5E7EB"
              style={{ marginRight: 8 }}
              solid
            />
            <Text style={styles.chipText} numberOfLines={1}>
              {roadType}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Journey Type</Text>
          <View style={[styles.chip, styles.chipPink]}>
            <FontAwesome5
              name="suitcase-rolling"
              size={14}
              color="#FCE7F3"
              style={{ marginRight: 8 }}
              solid
            />
            <Text style={styles.chipText} numberOfLines={2}>
              {journeyClassification}
            </Text>
          </View>
        </View>
      </View>

      {/* Anomaly / Notification */}
      {anomalyText ? (
        <View style={styles.anomalyCard}>
          <FontAwesome5
            name="exclamation-triangle"
            size={18}
            color="#FBBF24"
            style={{ marginRight: 12 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.anomalyTitle}>Alerts / Anomalies</Text>
            <Text style={styles.anomalyText}>{anomalyText}</Text>
          </View>
        </View>
      ) : null}

      {/* Map + Stops */}
      <View className="mapCard" style={styles.mapCard}>
        <Text style={styles.sectionTitle}>Live Map</Text>
        <View style={styles.mapWrapper}>
          <MapView
            style={styles.mapView}
            region={currentRegion}
            showsUserLocation={true}
            customMapStyle={darkMapStyle}
          >
            {currentRegion && (
              <Marker coordinate={currentRegion} title="You are here" />
            )}
            {journeyPath.length > 1 && (
              <Polyline
                coordinates={journeyPath}
                strokeColor="#4F46E5"
                strokeWidth={4}
              />
            )}
          </MapView>
        </View>

        <View style={styles.haltSection}>
          <Text style={styles.haltTitle}>Recent Stops</Text>
          {haltedPlaces.length === 0 ? (
            <Text style={styles.haltItem}>No stops detected yet.</Text>
          ) : (
            haltedPlaces.map((p, idx) => (
              <Text key={idx} style={styles.haltItem}>
                • {p}
              </Text>
            ))
          )}
        </View>
      </View>

      {/* Manual Override */}
      <View style={styles.overrideSection}>
        <Text style={styles.sectionTitle}>Manual Override</Text>
        <View style={styles.overrideRow}>
          {/* Bus */}
          <TouchableOpacity
            style={[
              styles.overrideBtn,
              currentMode === "bus" && styles.overrideBtnActive,
            ]}
            onPress={() => handleManualOverride("bus")}
          >
            <FontAwesome5
              name="bus-alt"
              size={22}
              color={currentMode === "bus" ? "#fff" : "#9CA3AF"}
            />
            <Text
              style={[
                styles.overrideText,
                currentMode === "bus" && { color: "#fff" },
              ]}
            >
              Bus
            </Text>
          </TouchableOpacity>

          {/* Train */}
          <TouchableOpacity
            style={[
              styles.overrideBtn,
              currentMode === "train" && styles.overrideBtnActive,
            ]}
            onPress={() => handleManualOverride("train")}
          >
            <FontAwesome5
              name="train"
              size={22}
              color={currentMode === "train" ? "#fff" : "#9CA3AF"}
            />
            <Text
              style={[
                styles.overrideText,
                currentMode === "train" && { color: "#fff" },
              ]}
            >
              Train
            </Text>
          </TouchableOpacity>

          {/* Metro */}
          <TouchableOpacity
            style={[
              styles.overrideBtn,
              currentMode === "metro" && styles.overrideBtnActive,
            ]}
            onPress={() => handleManualOverride("metro")}
          >
            <FontAwesome5
              name="subway"
              size={22}
              color={currentMode === "metro" ? "#fff" : "#9CA3AF"}
            />
            <Text
              style={[
                styles.overrideText,
                currentMode === "metro" && { color: "#fff" },
              ]}
            >
              Metro
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Privacy & Controls */}
      <View style={styles.privacyCard}>
        <Text style={styles.sectionTitle}>Privacy & Controls</Text>
        <View style={styles.privacyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyLabel}>Save journey history</Text>
            <Text style={styles.privacySub}>
              When off, trips are not stored on device.
            </Text>
          </View>
          <Switch
            value={saveHistoryEnabled}
            onValueChange={(val) => {
              setSaveHistoryEnabled(val);
              persistSettings({ saveHistoryEnabled: val });
            }}
          />
        </View>
        <View style={styles.privacyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyLabel}>Mask coordinates in reports</Text>
            <Text style={styles.privacySub}>
              Hides exact frequent-location coordinates in project reports.
            </Text>
          </View>
          <Switch
            value={maskCoords}
            onValueChange={(val) => {
              setMaskCoords(val);
              persistSettings({ maskCoords: val });
            }}
          />
        </View>
      </View>

      {/* SOS Button */}
      <TouchableOpacity style={styles.sosButton} onPress={startSosSequence}>
        <FontAwesome5 name="heartbeat" size={20} color="white" />
        <Text style={styles.sosButtonText}>INITIATE SOS</Text>
      </TouchableOpacity>

      {/* End Trip & Summary Button */}
      <TouchableOpacity style={styles.endTripButton} onPress={handleEndTrip}>
        <FontAwesome5 name="flag-checkered" size={18} color="#111827" />
        <Text style={styles.endTripButtonText}>END TRIP & VIEW SUMMARY</Text>
      </TouchableOpacity>

      {/* SOS Modal */}
      <Modal visible={isSosVisible} transparent animationType="fade">
        <View style={styles.sosOverlay}>
          <Text style={styles.sosTitle}>EMERGENCY DETECTED</Text>
          <Text style={styles.sosSubtitle}>Sending alert in...</Text>
          <Text style={styles.sosCountdown}>
            {sosCountdown > 0 ? sosCountdown : "SENT"}
          </Text>
          {sosCountdown > 0 ? (
            <TouchableOpacity
              style={styles.sosCancelButton}
              onPress={cancelSosSequence}
            >
              <Text style={styles.sosCancelText}>CANCEL</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.sosSentMessage}>
              SOS signal marked as sent (demo, Expo Go).
            </Text>
          )}
        </View>
      </Modal>

      {/* Trip Summary Modal */}
      <Modal visible={showSummary} transparent animationType="slide">
        <View style={styles.summaryOverlay}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Trip Summary</Text>

            {summaryData && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Distance</Text>
                  <Text style={styles.summaryValue}>
                    {summaryData.distance.toFixed(2)} km
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Avg Speed</Text>
                  <Text style={styles.summaryValue}>
                    {summaryData.avgSpeed.toFixed(1)} km/h
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Duration</Text>
                  <Text style={styles.summaryValue}>
                    {summaryData.durationMinutes.toFixed(1)} min
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Mode</Text>
                  <Text style={styles.summaryValue}>{summaryData.mode}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Confidence</Text>
                  <Text style={styles.summaryValue}>
                    {(summaryData.modeConfidence * 100).toFixed(0)}%
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Start</Text>
                  <Text
                    style={[styles.summaryValue, { flex: 1, textAlign: "right" }]}
                    numberOfLines={1}
                  >
                    {summaryData.startTime}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>End</Text>
                  <Text
                    style={[styles.summaryValue, { flex: 1, textAlign: "right" }]}
                    numberOfLines={1}
                  >
                    {summaryData.endTime}
                  </Text>
                </View>

                {/* Summary Map */}
                <View style={styles.summaryMapWrapper}>
                  <MapView
                    style={styles.summaryMap}
                    initialRegion={
                      summaryData.path && summaryData.path.length > 0
                        ? {
                            latitude: summaryData.path[0].latitude,
                            longitude: summaryData.path[0].longitude,
                            latitudeDelta: 0.05,
                            longitudeDelta: 0.05,
                          }
                        : undefined
                    }
                    customMapStyle={darkMapStyle}
                  >
                    {summaryData.path && summaryData.path.length > 0 && (
                      <>
                        <Polyline
                          coordinates={summaryData.path}
                          strokeColor="#4F46E5"
                          strokeWidth={4}
                        />
                        <Marker
                          coordinate={summaryData.path[0]}
                          title="Start"
                          pinColor="green"
                        />
                        <Marker
                          coordinate={
                            summaryData.path[summaryData.path.length - 1]
                          }
                          title="End"
                          pinColor="red"
                        />
                      </>
                    )}
                  </MapView>
                </View>

                {/* Stops */}
                <Text style={styles.summaryStopsTitle}>Stops Detected</Text>
                {summaryData.haltedPlaces.length === 0 ? (
                  <Text style={styles.summaryStopsItem}>- No stops.</Text>
                ) : (
                  summaryData.haltedPlaces.map((h, idx) => (
                    <Text key={idx} style={styles.summaryStopsItem}>
                      • {h}
                    </Text>
                  ))
                )}

                {/* Anomalies */}
                <Text style={styles.summaryStopsTitle}>Anomalies</Text>
                {summaryData.anomalies.length === 0 ? (
                  <Text style={styles.summaryStopsItem}>- None.</Text>
                ) : (
                  summaryData.anomalies.map((a, idx) => (
                    <Text key={idx} style={styles.summaryStopsItem}>
                      • {a}
                    </Text>
                  ))
                )}

                {/* Export buttons */}
                <View style={styles.summaryExportRow}>
                  <TouchableOpacity
                    style={styles.summaryExportBtn}
                    onPress={exportTripAsCSV}
                  >
                    <FontAwesome5 name="file-csv" size={14} color="#E5E7EB" />
                    <Text style={styles.summaryExportText}>Export CSV</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.summaryExportBtn}
                    onPress={exportTripAsTextReport}
                  >
                    <FontAwesome5 name="file-alt" size={14} color="#E5E7EB" />
                    <Text style={styles.summaryExportText}>Export Report</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity
              style={styles.summaryCloseBtn}
              onPress={() => setShowSummary(false)}
            >
              <Text style={styles.summaryCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dashboard & Achievements */}
      {dashboardStats && (
        <View style={styles.historyCard}>
          <Text style={styles.sectionTitle}>Travel Dashboard</Text>
          <Text style={styles.dashboardText}>
            Total trips: {dashboardStats.totalTrips}
          </Text>
          <Text style={styles.dashboardText}>
            Total distance: {dashboardStats.totalDistance.toFixed(2)} km
          </Text>

          <Text style={[styles.dashboardText, { marginTop: 8 }]}>
            Time spent by mode:
          </Text>
          {Object.entries(dashboardStats.modeTime || {}).map(
            ([mode, mins]) => (
              <View key={mode} style={styles.modeRow}>
                <Text style={styles.modeLabel}>{mode}</Text>
                <View style={styles.modeBarBackground}>
                  <View
                    style={[
                      styles.modeBarFill,
                      { flex: Math.min(1, mins / 60) || 0.1 },
                    ]}
                  />
                </View>
                <Text style={styles.modeValue}>{mins.toFixed(1)} min</Text>
              </View>
            )
          )}

          {dashboardStats.topRoute && (
            <Text style={[styles.dashboardText, { marginTop: 8 }]}>
              Common route: {dashboardStats.topRoute.route} (
              {dashboardStats.topRoute.count} times)
            </Text>
          )}

          {/* Achievements */}
          <Text style={[styles.dashboardText, { marginTop: 8 }]}>
            Achievements:
          </Text>
          {achievements.length === 0 ? (
            <Text style={styles.achievementItem}>- No badges yet. Keep going!</Text>
          ) : (
            achievements.map((b, idx) => (
              <Text key={idx} style={styles.achievementItem}>
                • {b}
              </Text>
            ))
          )}

          {/* Project report button */}
          <TouchableOpacity
            style={styles.projectReportButton}
            onPress={exportProjectReport}
          >
            <FontAwesome5 name="file-export" size={14} color="#111827" />
            <Text style={styles.projectReportText}>Generate Project Report</Text>
          </TouchableOpacity>
          
          {/* ML analytics report button */}
          <TouchableOpacity
            style={[styles.projectReportButton, { marginTop: 8, backgroundColor: "#4ADE80" }]}
            onPress={exportMLAnalyticsReportAndTrain}
          >
            <FontAwesome5 name="project-diagram" size={14} color="#111827" />
            <Text style={styles.projectReportText}>
              Export ML Analytics & Train KNN
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Full PDF report button */}
      <TouchableOpacity
        style={[styles.projectReportButton, { marginTop: 8, backgroundColor: "#38BDF8" }]}
        onPress={exportFullPDFReport}
      >
        <FontAwesome5 name="file-pdf" size={14} color="#111827" />
        <Text style={styles.projectReportText}>Export Full PDF Report</Text>
      </TouchableOpacity>

      {/* Recent Journeys */}
      <View style={styles.historyCard}>
        <Text style={styles.sectionTitle}>Recent Journeys</Text>
        {recentTrips.length === 0 ? (
          <Text style={{ color: "#9CA3AF" }}>No recent activity.</Text>
        ) : (
          recentTrips.map((trip) => (
            <View key={trip.id} style={styles.tripRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tripDate}>{trip.date}</Text>
                <Text style={styles.tripMeta}>
                  Distance: {trip.distance} km • Avg Speed: {trip.avgSpeed} km/h
                </Text>
                {trip.durationMinutes && (
                  <Text style={styles.tripMeta}>
                    Duration: {trip.durationMinutes} min
                  </Text>
                )}
                <Text style={styles.tripMeta}>Mode: {trip.mode}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  navigation.navigate("PlaceDetails", {
                    place: {
                      name: `Past trip - ${trip.mode}`,
                      address: `${trip.distance} km`,
                      lat: trip.end.lat,
                      lon: trip.end.lon,
                      currentLat: currentRegion?.latitude,
                      currentLon: currentRegion?.longitude,
                    },
                  });
                }}
              >
                <Text style={styles.tripView}>View</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

              {/* NEW: Load demo data button */}
        <TouchableOpacity
          onPress={loadDemoVadodaraData}
          style={{ marginTop: 10, alignSelf: "flex-start" }}
        >
          <Text style={{ color: "#38BDF8", fontWeight: "700", fontSize: 13 }}>
            Load Demo Data (Vadodara)
          </Text>
        </TouchableOpacity>

        <View style={styles.historyActions}>
          <TouchableOpacity
            onPress={async () => {
              await AsyncStorage.removeItem(STORAGE_KEY);
              setRecentTrips([]);
              setDashboardStats(null);
              setAchievements([]);
            }}
          >
            <Text style={styles.historyClear}>Clear History</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={loadHistory}>
            <Text style={styles.historyReload}>Reload</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  v3Header: {
    paddingVertical: 12,
    alignItems: "center",
  },
  v3HeaderTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  v3HeaderSubtitle: {
    color: "#9CA3AF",
    marginTop: 4,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  label: {
    color: "#9CA3AF",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    color: "#E5E7EB",
    fontWeight: "600",
    fontSize: 12,
    flexShrink: 1,
  },
  chipGreen: {
    borderColor: "#16A34A",
    backgroundColor: "rgba(22,163,74,0.08)",
  },
  chipGray: {
    borderColor: "#4B5563",
    backgroundColor: "rgba(31,41,55,0.75)",
  },
  chipPink: {
    borderColor: "#EC4899",
    backgroundColor: "rgba(236,72,153,0.08)",
  },
  anomalyCard: {
    backgroundColor: "#111827",
    borderColor: "#4F46E5",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  anomalyTitle: {
    color: "#FBBF24",
    fontWeight: "700",
    fontSize: 14,
  },
  anomalyText: {
    color: "#FDE68A",
    fontSize: 13,
    marginTop: 4,
  },
  mapCard: {
    backgroundColor: "#020617",
    padding: 16,
    borderRadius: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  sectionTitle: {
    color: "#E5E7EB",
    fontWeight: "600",
    fontSize: 15,
    marginBottom: 12,
  },
  mapWrapper: {
    height: 220,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
  },
  mapView: {
    flex: 1,
  },
  haltSection: {
    marginTop: 4,
  },
  haltTitle: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 4,
  },
  haltItem: {
    color: "#6B7280",
    fontSize: 12,
  },
  overrideSection: {
    backgroundColor: "#020617",
    padding: 16,
    borderRadius: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  overrideRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  overrideBtn: {
    width: "30%",
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  overrideBtnActive: {
    backgroundColor: "#3B82F6",
    borderColor: "#60A5FA",
  },
  overrideText: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 6,
    fontWeight: "600",
  },
  privacyCard: {
    backgroundColor: "#020617",
    padding: 16,
    borderRadius: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  privacyLabel: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "600",
  },
  privacySub: {
    color: "#6B7280",
    fontSize: 11,
  },
  sosButton: {
    backgroundColor: "#DC2626",
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  sosButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 17,
    marginLeft: 8,
  },
  endTripButton: {
    backgroundColor: "#FACC15",
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
  },
  endTripButtonText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 15,
    marginLeft: 8,
  },
  sosOverlay: {
    flex: 1,
    backgroundColor: "rgba(220,38,38,0.96)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  sosTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
  },
  sosSubtitle: {
    fontSize: 18,
    color: "#FEE2E2",
    marginTop: 10,
  },
  sosCountdown: {
    fontSize: 80,
    fontWeight: "800",
    color: "#FFFFFF",
    marginVertical: 20,
  },
  sosCancelButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 12,
  },
  sosCancelText: {
    color: "#DC2626",
    fontWeight: "700",
    fontSize: 16,
  },
  sosSentMessage: {
    color: "#FEE2E2",
    fontSize: 15,
    marginTop: 10,
    textAlign: "center",
  },
  summaryOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  summaryCard: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: "#020617",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  summaryTitle: {
    color: "#E5E7EB",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 3,
  },
  summaryLabel: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  summaryValue: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "600",
  },
  summaryMapWrapper: {
    marginTop: 12,
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
  },
  summaryMap: {
    flex: 1,
  },
  summaryStopsTitle: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 12,
    marginBottom: 4,
  },
  summaryStopsItem: {
    color: "#6B7280",
    fontSize: 12,
  },
  summaryExportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  summaryExportBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#111827",
  },
  summaryExportText: {
    color: "#E5E7EB",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 6,
  },
  summaryCloseBtn: {
    marginTop: 14,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  summaryCloseText: {
    color: "#E5E7EB",
    fontWeight: "600",
    fontSize: 13,
  },
  historyCard: {
    backgroundColor: "#020617",
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.6,
    borderColor: "#111827",
  },
  tripDate: {
    color: "#E5E7EB",
    fontWeight: "600",
    fontSize: 13,
  },
  tripMeta: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  tripView: {
    color: "#3B82F6",
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 10,
  },
  historyActions: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  historyClear: {
    color: "#F97316",
    fontWeight: "700",
    fontSize: 13,
  },
  historyReload: {
    color: "#22C55E",
    fontWeight: "700",
    fontSize: 13,
  },
  dashboardText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  modeLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    width: 70,
  },
  modeBarBackground: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#111827",
    marginHorizontal: 6,
    flexDirection: "row",
    overflow: "hidden",
  },
  modeBarFill: {
    backgroundColor: "#3B82F6",
  },
  modeValue: {
    color: "#9CA3AF",
    fontSize: 11,
  },
  achievementItem: {
    color: "#FBBF24",
    fontSize: 12,
    marginTop: 2,
  },
  projectReportButton: {
    marginTop: 12,
    backgroundColor: "#FACC15",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  projectReportText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 12,
    marginLeft: 6,
  },
});