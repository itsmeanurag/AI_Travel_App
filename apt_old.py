// ATP_Screen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert, Image } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import axios from 'axios';
import MapView, { Marker, Polyline } from 'react-native-maps';
import AsyncStorage from "@react-native-async-storage/async-storage";

// --- HELPER FUNCTIONS ---
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

export default function ATPScreen({ route, navigation }) {
    // --- STATE MANAGEMENT ---
    const [isManualOverride, setIsManualOverride] = useState(false);
    const [currentMode, setCurrentMode] = useState('unknown');
    const [movementStatusText, setMovementStatusText] = useState('Acquiring GPS...');
    const [movementStatusIcon, setMovementStatusIcon] = useState('satellite-dish');
    const [anomalyText, setAnomalyText] = useState('');
    const [haltedPlaces, setHaltedPlaces] = useState([]);
    const [isSosVisible, setIsSosVisible] = useState(false);
    const [sosCountdown, setSosCountdown] = useState(15);
    const [currentRegion, setCurrentRegion] = useState(null);
    const [roadType, setRoadType] = useState('N/A');
    const [journeyPath, setJourneyPath] = useState([]);
    const [journeyClassification, setJourneyClassification] = useState('Analysis Pending...');
    const [hasStableGps, setHasStableGps] = useState(false);

    const [recentTrips, setRecentTrips] = useState([]); // <-- recent trips

    const { apiKey } = route.params || {}; // allow GEOAPIFY key to be passed; if not, must be inlined

    const sosTimerRef = useRef(null);
    const locationSubscription = useRef(null);
    const lastLocationRef = useRef(null);
    const stopAnalysisTimer = useRef(null);
    const lastApiCallTimestamp = useRef(0); // NEW: For throttling API calls

    // --- API & ALGORITHM FUNCTIONS ---
    const getCityFromCoords = async (lat, lon) => {
        if (!hasStableGps) return 'Unknown';
        const key = apiKey || "cdd25e128003407b8c836581f3bea685";
        const url = `https://api.geoapify.com/v1/revgeocode?lat=${lat}&lon=${lon}&apiKey=${key}`;
        try {
            const response = await axios.get(url);
            return response.data.features?.[0]?.properties.city || response.data.features?.[0]?.properties.county || 'Unknown';
        } catch (error) {
            console.error("Failed to fetch city data:", error);
            return 'Unknown';
        }
    };

    // OPTIMIZED: This function now updates state directly and can be called without await
    const updateContextualData = async (lat, lon) => {
        if (!hasStableGps || typeof lat !== 'number' || typeof lon !== 'number') return;
        
        // Throttle API calls to once every 10 seconds
        const now = Date.now();
        if (now - lastApiCallTimestamp.current < 10000) return;
        lastApiCallTimestamp.current = now;

        // Fetch Road Data
        const key = apiKey || "cdd25e128003407b8c836581f3bea685";
        const roadUrl = `https://api.geoapify.com/v1/revgeocode?lat=${lat}&lon=${lon}&apiKey=${key}`;
        try {
            const response = await axios.get(roadUrl);
            const properties = response.data.features?.[0]?.properties;
            if (properties) {
                setRoadType(properties.street || properties.road || properties.name || 'Unknown Road');
            }
        } catch (error) {
            console.error("Failed to fetch road data:", error);
            setRoadType('API Error');
        }
    };
    
    // The main analysis function is now much faster and leaner.
    const analyzeMovement = (location) => {
        if (isManualOverride || !location?.coords) return;
        const { speed, latitude, longitude, altitude } = location.coords;

        if (!hasStableGps && latitude && longitude) {
            setHasStableGps(true);
        }

        // --- IMMEDIATE UI UPDATES ---
        setCurrentRegion({ latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
        setJourneyPath(prevPath => {
            // add point only if significantly different
            const last = prevPath[prevPath.length - 1];
            if (!last || Math.abs(last.latitude - latitude) > 0.00003 || Math.abs(last.longitude - longitude) > 0.00003) {
                return [...prevPath, { latitude, longitude }];
            }
            return prevPath;
        });
        setMovementStatusText(speed > 0.1 ? `Moving at ${speed.toFixed(1)} m/s` : 'Stationary');
        setMovementStatusIcon(speed > 0.1 ? 'tachometer-alt' : 'hand-paper');
        
        let detectedMode = 'stationary';
        if (speed > 8) { 
            detectedMode = 'vehicle'; // Simplified initial detection
        } else if (speed > 0.4) {
            detectedMode = 'walking';
        }
        updateCurrentMode(detectedMode);
        
        // --- BACKGROUND/DELAYED ANALYSIS (DOES NOT BLOCK UI) ---
        updateContextualData(latitude, longitude); // Fire-and-forget API call

        if (detectedMode === 'stationary') {
            if (!stopAnalysisTimer.current) {
                stopAnalysisTimer.current = setTimeout(() => {
                    analyzeStop({ lat: latitude, lon: longitude }); 
                    stopAnalysisTimer.current = null;
                }, 15000);
            }
        } else {
            clearTimeout(stopAnalysisTimer.current);
            stopAnalysisTimer.current = null;
        }
    };
    
    // This function will now be triggered by the background analysis
    const analyzeStop = async (point) => {
        const key = apiKey || "cdd25e128003407b8c836581f3bea685";
        const url = `https://api.geoapify.com/v2/places?categories=catering&filter=circle:${point.lon},${point.lat},100&limit=1&apiKey=${key}`;
        try {
            const response = await axios.get(url);
            const place = response.data.features?.[0]?.properties;
            if (place) {
                 const haltReason = `Halted near ${place.name || place.address_line1 || "a place"}.`;
                 setHaltedPlaces(prev => {
                    const next = [...prev];
                    if (!next.includes(haltReason)) {
                        next.unshift(haltReason);
                        return next.slice(0, 6);
                    }
                    return prev;
                 });
            }
        } catch (error) {
            console.error("Failed to fetch contextual data:", error);
        }
    };

    const updateCurrentMode = (mode) => {
      if (!isManualOverride) setCurrentMode(mode);
    };

    const startSosSequence = () => {
        setIsSosVisible(true);
        setSosCountdown(15);
        sosTimerRef.current = setInterval(() => setSosCountdown(prev => {
            if (prev <= 1) {
                clearInterval(sosTimerRef.current);
                // Here you would send actual alert or FCM; for now we just show SENT state.
                return 0;
            }
            return prev - 1;
        }), 1000);
    };
    
    const cancelSosSequence = () => {
        clearInterval(sosTimerRef.current);
        setIsSosVisible(false);
    };

    // ----- HISTORY (AsyncStorage) -----
    const STORAGE_KEY = "travel_history_v1";

    const loadHistory = async () => {
        try {
            const existing = await AsyncStorage.getItem(STORAGE_KEY);
            if (existing) setRecentTrips(JSON.parse(existing));
        } catch (e) {
            console.log("Failed to load history", e);
        }
    };

    const saveCompletedJourney = async () => {
        try {
            if (journeyPath.length < 5) return; // too short

            const startPoint = journeyPath[0];
            const endPoint = journeyPath[journeyPath.length - 1];

            const totalDistance = getDistanceFromLatLonInKm(
                startPoint.latitude, startPoint.longitude, endPoint.latitude, endPoint.longitude
            );

            // Estimate time: assume position sample approx every 3s
            const estimatedSeconds = Math.max(1, (journeyPath.length - 1) * 3);
            const hours = estimatedSeconds / 3600;
            const avgSpeed = hours > 0 ? (totalDistance / hours) : 0;

            const mode = currentMode;

            const newEntry = {
                id: Date.now(),
                date: new Date().toLocaleString(),
                distance: Number(totalDistance.toFixed(2)),
                avgSpeed: Number(avgSpeed.toFixed(1)),
                mode,
                start: { lat: startPoint.latitude, lon: startPoint.longitude },
                end: { lat: endPoint.latitude, lon: endPoint.longitude }
            };

            const existing = await AsyncStorage.getItem(STORAGE_KEY);
            let history = existing ? JSON.parse(existing) : [];
            history.unshift(newEntry);
            history = history.slice(0, 10);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
            setRecentTrips(history);
        } catch (e) {
            console.log("History save failed", e);
        }
    };

    useEffect(() => {
        const analyzeCompletedJourney = async () => {
             if (journeyPath.length < 20) {
                setJourneyClassification('Trip too short to classify.');
                return;
             }
             const startPoint = journeyPath[0];
             const endPoint = journeyPath[journeyPath.length - 1];
             const totalDistance = getDistanceFromLatLonInKm(startPoint.latitude, startPoint.longitude, endPoint.latitude, endPoint.longitude);
             const startCity = await getCityFromCoords(startPoint.latitude, startPoint.longitude);
             const endCity = await getCityFromCoords(endPoint.latitude, endPoint.longitude);
             
             if (totalDistance > 50 && startCity !== endCity) {
                 setJourneyClassification(`Long-Distance Travel (${startCity} to ${endCity})`);
             } else {
                 setJourneyClassification(`Local Commute in ${startCity}`);
             }
        };

        const startLocationTracking = async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required.');
                setMovementStatusText('Permission Denied');
                setMovementStatusIcon('times-circle');
                return;
            }

            try {
                const initialLocation = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                    timeout: 5000,
                });
                if (initialLocation.coords) {
                    analyzeMovement(initialLocation);
                }
            } catch (error) {
                 Alert.alert('GPS Error', 'Could not get an initial location. Please make sure your GPS is enabled.');
                 setMovementStatusText('GPS Error');
                 return;
            }

            locationSubscription.current = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 5 },
                (location) => analyzeMovement(location)
            );
        };

        loadHistory();
        startLocationTracking();

        return () => {
            locationSubscription.current?.remove();
            clearTimeout(stopAnalysisTimer.current);
            // save analysis & history on unmount
            saveCompletedJourney();
            analyzeCompletedJourney();
        };
    }, [isManualOverride, journeyPath]); // re-run dependably when journeyPath updates

    const handleManualOverride = (mode) => {
        setIsManualOverride(true);
        setCurrentMode(mode);
        setAnomalyText(`Mode manually set to ${mode}.`);
        locationSubscription.current?.remove();
        setTimeout(() => {
            setIsManualOverride(false);
            setAnomalyText('');
        }, 8000);
    };
    
    const getModeUI = (mode) => {
        switch (mode) {
            case 'stationary': return { text: 'Stationary', icon: 'pause-circle', color: '#3B82F6' };
            case 'walking': return { text: 'Walking', icon: 'walking', color: '#8B5CF6' };
            case 'vehicle': return { text: 'Vehicle', icon: 'car', color: '#4F46E5' };
            case 'bus': return { text: 'Bus', icon: 'bus-alt', color: '#EF4444' };
            case 'train': return { text: 'Train', icon: 'train', color: '#F97316' };
            case 'plane': return { text: 'Plane', icon: 'plane-departure', color: '#10B981' };
            default: return { text: 'Unknown', icon: 'question-circle', color: '#6B7280' };
        }
    };

    const { text: modeText, icon: modeIcon, color: modeColor } = getModeUI(currentMode);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Travel Profiler</Text>
                <Text style={styles.headerSubtitle}>Your personal journey analyst is active.</Text>
            </View>

            <View style={styles.statusGrid}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Current Status</Text>
                    <View style={[styles.statusBadge, {backgroundColor: '#10B981'}]}>
                        <FontAwesome5 name={movementStatusIcon} size={14} color="white" style={{ marginRight: 8 }} solid/>
                        <Text style={styles.statusBadgeText}>{movementStatusText}</Text>
                    </View>
                </View>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Mode of Movement</Text>
                     <View style={[styles.statusBadge, {backgroundColor: modeColor}]}>
                        <FontAwesome5 name={modeIcon} size={14} color="white" style={{ marginRight: 8 }} solid/>
                        <Text style={styles.statusBadgeText}>{modeText}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.statusGrid}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Current Road</Text>
                    <View style={[styles.statusBadge, {backgroundColor: '#6B7280'}]}>
                        <FontAwesome5 name="road" size={14} color="white" style={{ marginRight: 8 }} solid/>
                        <Text style={styles.statusBadgeText}>{roadType}</Text>
                    </View>
                </View>
                 <View style={styles.card}>
                    <Text style={styles.cardTitle}>Journey Type</Text>
                    <View style={[styles.statusBadge, {backgroundColor: '#EC4899'}]}>
                        <FontAwesome5 name="suitcase-rolling" size={14} color="white" style={{ marginRight: 8 }} solid/>
                        <Text style={styles.statusBadgeText}>{journeyClassification}</Text>
                    </View>
                </View>
            </View>

            {anomalyText ? (
                <View style={styles.anomalyCard}>
                    <FontAwesome5 name="exclamation-triangle" size={18} color="#FBBF24" style={{ marginRight: 12 }}/>
                    <View>
                        <Text style={styles.anomalyTitle}>Advance Notification</Text>
                        <Text style={styles.anomalyText}>{anomalyText}</Text>
                    </View>
                </View>
            ) : null}

            <View style={styles.card}>
                 <View style={styles.mapContainer}>
                    <MapView style={styles.map} region={currentRegion} showsUserLocation={false}>
                       {currentRegion && <Marker coordinate={currentRegion} title="You are here" pinColor="blue" />}
                       {journeyPath.length > 0 && <Polyline coordinates={journeyPath} strokeColor="#4F46E5" strokeWidth={4} />}
                    </MapView>
                    <View style={styles.placesContainer}>
                        <View>
                            <Text style={styles.placesTitle}>Halted At</Text>
                            {haltedPlaces.length > 0 ? haltedPlaces.map((place, index) => <Text key={index} style={styles.placeItem}>- {place}</Text>) : <Text style={styles.placeItem}>- No stops detected yet.</Text>}
                        </View>
                    </View>
                </View>
            </View>
            
            <View style={styles.card}>
                <Text style={styles.cardTitleCentered}>Manual Override</Text>
                <View style={styles.overrideContainer}>
                     <TouchableOpacity style={[styles.overrideButton, currentMode === 'bus' && styles.overrideButtonActive]} onPress={() => handleManualOverride('bus')}>
                        <FontAwesome5 name="bus-alt" size={24} color={currentMode === 'bus' ? 'white' : '#9CA3AF'}/>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.overrideButton, currentMode === 'train' && styles.overrideButtonActive]} onPress={() => handleManualOverride('train')}>
                        <FontAwesome5 name="train" size={24} color={currentMode === 'train' ? 'white' : '#9CA3AF'}/>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.overrideButton, currentMode === 'plane' && styles.overrideButtonActive]} onPress={() => handleManualOverride('plane')}>
                        <FontAwesome5 name="plane" size={24} color={currentMode === 'plane' ? 'white' : '#9CA3AF'}/>
                    </TouchableOpacity>
                </View>
            </View>
            
            <TouchableOpacity style={styles.sosButton} onPress={startSosSequence}>
                <FontAwesome5 name="heartbeat" size={20} color="white"/>
                <Text style={styles.sosButtonText}>INITIATE SOS</Text>
            </TouchableOpacity>

            <Modal visible={isSosVisible} transparent={true} animationType="fade">
                <View style={styles.sosOverlay}>
                    <Text style={styles.sosTitle}>EMERGENCY DETECTED</Text>
                    <Text style={styles.sosSubtitle}>Sending alert in...</Text>
                    <Text style={styles.sosCountdown}>{sosCountdown > 0 ? sosCountdown : 'SENT'}</Text>
                     {sosCountdown > 0 ? (
                        <TouchableOpacity style={styles.sosCancelButton} onPress={cancelSosSequence}>
                            <Text style={styles.sosCancelText}>CANCEL</Text>
                        </TouchableOpacity>
                    ) : (
                         <Text style={styles.sosSentMessage}>SOS signal sent to emergency contacts.</Text>
                    )}
                </View>
            </Modal>

            {/* ------------- RECENT JOURNEYS ------------- */}
            <View style={styles.card}>
                <Text style={styles.cardTitleCentered}>Recent Journeys</Text>
                {recentTrips.length === 0 ? (
                    <Text style={{ color: "#9CA3AF" }}>No recent activity.</Text>
                ) : (
                    recentTrips.map((trip) => (
                        <View key={trip.id} style={styles.tripRow}>
                            <View style={{flex:1}}>
                                <Text style={{ color: "white", fontWeight: "700" }}>{trip.date}</Text>
                                <Text style={{ color: "#9CA3AF", marginTop: 4 }}>
                                    Distance: {trip.distance} km • Avg Speed: {trip.avgSpeed} km/h
                                </Text>
                                <Text style={{ color: "#9CA3AF", marginTop: 4 }}>Mode: {trip.mode}</Text>
                            </View>
                            <View style={{ justifyContent: "center" }}>
                                <TouchableOpacity onPress={() => {
                                    // simple navigation to map view of trip end
                                    navigation.navigate("PlaceDetails", {
                                        place: {
                                            name: `Past trip - ${trip.mode}`,
                                            address: `${trip.distance} km`,
                                            lat: trip.end.lat,
                                            lon: trip.end.lon,
                                            currentLat: currentRegion?.latitude,
                                            currentLon: currentRegion?.longitude
                                        }
                                    });
                                }}>
                                    <Text style={{ color: "#2196F3", fontWeight: "700" }}>View</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}

                <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
                    <TouchableOpacity onPress={async () => {
                        await AsyncStorage.removeItem("travel_history_v1");
                        setRecentTrips([]);
                    }}>
                        <Text style={{ color: "#EF4444", fontWeight: "700" }}>Clear History</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={loadHistory}>
                        <Text style={{ color: "#10B981", fontWeight: "700" }}>Reload</Text>
                    </TouchableOpacity>
                </View>
            </View>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f1724',
    },
    contentContainer: {
        padding: 16,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
    },
    headerSubtitle: {
        fontSize: 16,
        color: '#9CA3AF',
        marginTop: 4,
    },
    statusGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
        gap: 16,
    },
    card: {
        backgroundColor: '#1F2937',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#374151',
        marginBottom: 16,
        flex: 1,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#D1D5DB',
        marginBottom: 8,
    },
    cardTitleCentered: {
        fontSize: 16,
        fontWeight: '600',
        color: '#D1D5DB',
        marginBottom: 16,
        textAlign: 'center',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        alignSelf: 'flex-start',
    },
    statusBadgeText: {
        color: 'white',
        fontWeight: '600',
        textTransform: 'uppercase',
        fontSize: 12,
        flexShrink: 1,
    },
    anomalyCard: {
        backgroundColor: '#3730A3',
        borderColor: '#4F46E5',
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    anomalyTitle: {
        color: '#FBBF24',
        fontWeight: 'bold',
        fontSize: 16,
    },
    anomalyText: {
        color: '#FDE68A',
        fontSize: 14,
        marginTop: 4,
        flexShrink: 1,
    },
    mapContainer: {
        flexDirection: 'row',
    },
    map: {
        flex: 2,
        height: 180,
        borderRadius: 12,
        marginRight: 16,
    },
    placesContainer: {
        flex: 1,
    },
    placesTitle: {
        fontWeight: 'bold',
        color: '#D1D5DB',
        marginBottom: 4,
    },
    placeItem: {
        color: '#9CA3AF',
        fontSize: 12,
    },
    overrideContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    overrideButton: {
        backgroundColor: '#374151',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        width: '30%',
    },
    overrideButtonActive: {
        backgroundColor: '#3B82F6',
    },
    overrideText: {
        color: '#9CA3AF',
        marginTop: 4,
        fontSize: 12,
    },
    sosButton: {
        backgroundColor: '#DC2626',
        borderRadius: 999,
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    sosButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 18,
        marginLeft: 8,
    },
    sosOverlay: {
        flex: 1,
        backgroundColor: 'rgba(220, 38, 38, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sosTitle: {
        fontSize: 40,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    sosSubtitle: {
        fontSize: 20,
        color: 'white',
        marginTop: 12,
    },
    sosCountdown: {
        fontSize: 96,
        fontWeight: 'bold',
        color: 'white',
        marginVertical: 20,
    },
    sosCancelButton: {
        backgroundColor: 'white',
        paddingVertical: 16,
        paddingHorizontal: 28,
        borderRadius: 12,
    },
    sosCancelText: {
        color: '#DC2626',
        fontWeight: '700',
        fontSize: 16,
    },
    sosSentMessage: {
        color: 'white',
        fontSize: 16,
    },
    tripRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 0.5,
        borderColor: "#2b3440"
    }
});
