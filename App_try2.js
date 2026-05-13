import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Image,
  StyleSheet,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import axios from "axios";
import { Ionicons, MaterialIcons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

const WEATHER_API_KEY = "806df16e1debfd430338d685e9bfa487";
const GEOAPIFY_API_KEY = "cdd25e128003407b8c836581f3bea685";
const AIR_API_KEY = "7982c6b622f0dae8b8032720c5973f3e";

const aqiLabel = (val) => {
  if (!val || isNaN(val)) return "N/A";
  if (val <= 50) return "Good";
  if (val <= 100) return "Moderate";
  if (val <= 150) return "Unhealthy (Sensitive)";
  if (val <= 200) return "Unhealthy";
  if (val <= 300) return "Very Unhealthy";
  if (val > 300) return "Hazardous";
  return "N/A";
};
const aqiColor = (val) => {
  if (!val || isNaN(val)) return "#9CA3AF";
  if (val <= 50) return "#10B981";
  if (val <= 100) return "#F59E0B";
  if (val <= 150) return "#EF4444";
  if (val <= 200) return "#C026D3";
  if (val <= 300) return "#7C3AED";
  if (val > 300) return "#111";
  return "#444";
};

function haversineDistance(lat1, lon1, lat2, lon2) {
  function toRad(x) {
    return (x * Math.PI) / 180;
  }
  var R = 6371;
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ========== Home Screen ==========
function HomeScreen({ navigation }) {
  const [region, setRegion] = useState(null);
  const [aqi, setAqi] = useState(null);
  const [aqiForecast, setAqiForecast] = useState([]);
  const [aqiModal, setAqiModal] = useState(false);

  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [weatherModal, setWeatherModal] = useState(false);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        alert("Location permission needed!");
        return;
      }
      let location = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.011,
        longitudeDelta: 0.011,
      });
      getWeather(location.coords.latitude, location.coords.longitude);
      getAQI(location.coords.latitude, location.coords.longitude);
    })();
  }, []);
  async function getWeather(lat, lon) {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
    );
    setWeather({
      temp: Math.round(res.data.main.temp),
      desc: res.data.weather[0].description,
      main: res.data.weather[0].main,
      icon: res.data.weather[0].icon,
    });
    const res2 = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
    );
    setForecast(res2.data.list.slice(0, 8).map((item) => ({
      dt: item.dt_txt,
      temp: Math.round(item.main.temp),
      main: item.weather[0].main,
      icon: item.weather[0].icon,
    })));
  }
  async function getAQI(lat, lon) {
    const res = await axios.get(
      `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${AIR_API_KEY}`
    );
    const aqidata = res?.data?.data ?? {};
    setAqi(aqidata.aqi || "-");
    setAqiForecast((aqidata.forecast?.daily?.pm25 ?? []).slice(0, 7));
  }

  if (!region || !weather)
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#2196F3" size="large" />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Search bar (absolute, a bit down from top for notch) */}
      <View style={styles.homeTopSearchBox}>
        <TouchableOpacity
          style={styles.fakeSearchBox}
          onPress={() => navigation.navigate("Search")}
        >
          <Ionicons name="search" size={24} color="#2196F3" />
          <Text style={{ marginLeft: 10, color: "#888", fontSize: 17 }}>Search here...</Text>
        </TouchableOpacity>
      </View>
      <MapView
        style={{ flex: 1 }}
        region={region}
        showsUserLocation
        zoomControlEnabled
      >
        <Marker coordinate={region} title="Your Location" />
      </MapView>
      {/* AQI/Weather pills: right-side, pill + wide, pretty! */}
      <View style={styles.rightPillsContainer}>
        <TouchableOpacity
          onPress={() => setAqiModal(true)}
          style={[styles.infoPillWide, { backgroundColor: aqiColor(aqi) }]}
        >
          <MaterialIcons name="air" color="#fff" size={23} />
          <View style={{ marginLeft: 11 }}>
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>AQI</Text>
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>{aqi} <Text style={{ fontSize: 12, fontWeight: "400" }}>{aqiLabel(aqi)}</Text></Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setWeatherModal(true)}
          style={[styles.infoPillWide, { borderColor: "#2196F3", borderWidth: 1, marginTop: 13, backgroundColor: "#fff" }]}
        >
          <Image
            source={{ uri: `https://openweathermap.org/img/wn/${weather.icon}@2x.png` }}
            style={{ width: 34, height: 34, marginRight: 10 }}
          />
          <View>
            <Text style={{ color: "#2196F3", fontWeight: "bold", fontSize: 16 }}>{weather.temp}°C</Text>
            <Text style={{ color: "#222", fontSize: 14 }}>{weather.main}</Text>
          </View>
        </TouchableOpacity>
      </View>
      {/* Bottom nav */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabBtn}>
          <Ionicons name="home" size={29} color="#2196F3" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabBtn}>
          <Ionicons name="bookmark" size={29} color="#2196F3" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => navigation.navigate("Search")}
        >
          <Ionicons name="add-circle" size={46} color="#10B981" />
        </TouchableOpacity>
      </View>
      <ForecastModal
        visible={weatherModal}
        onClose={() => setWeatherModal(false)}
        title="Weather Forecast"
        data={forecast.map((item) => ({
          label: item.dt.split(" ")[1].slice(0, 5),
          value: `${item.temp}°C`,
          icon: `https://openweathermap.org/img/wn/${item.icon}.png`,
        }))}
        desc={weather.desc}
      />
      <ForecastModal
        visible={aqiModal}
        onClose={() => setAqiModal(false)}
        title="AQI (Air Quality Index) Forecast"
        data={aqiForecast.map((item) => ({
          label: item.day,
          value: item.avg,
          icon: null,
        }))}
        isAqi
        desc={aqiLabel(aqi)}
      />
    </View>
  );
}

// ========== Search Screen ==========
function SearchScreen({ navigation }) {
  const [query, setQuery] = useState("");
  const [currentLoc, setCurrentLoc] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Location.getCurrentPositionAsync({}).then((loc) => setCurrentLoc(loc.coords));
  }, []);
  useEffect(() => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    axios
      .get(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
          query
        )}&apiKey=${GEOAPIFY_API_KEY}&limit=8`
      )
      .then((r) => setSuggestions(r.data?.features || []))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <SafeAreaView style={styles.fullFlexWhite}>
      <View style={styles.firstSearchHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" color="#2196F3" size={24} />
        </TouchableOpacity>
        <TextInput
          style={styles.firstSearchInput}
          placeholder="Search places, addresses..."
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" color="#bbb" size={22} />
          </TouchableOpacity>
        )}
      </View>
      {loading && (
        <ActivityIndicator color="#2196F3" size="small" style={{ marginVertical: 20 }} />
      )}
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={suggestions}
        keyExtractor={(item, idx) => `${item.properties.place_id}-${idx}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.resultItem}
            onPress={() =>
              navigation.navigate("PlaceDetails", {
                place: {
                  name: item.properties.name || item.properties.formatted,
                  address: item.properties.formatted,
                  lat: item.properties.lat ?? item.geometry.coordinates[1],
                  lon: item.properties.lon ?? item.geometry.coordinates[0],
                  currentLat: currentLoc?.latitude,
                  currentLon: currentLoc?.longitude,
                },
              })
            }
          >
            <Ionicons name="location-outline" size={22} color="#2196F3" style={{ marginRight: 10 }} />
            <View>
              <Text style={{ fontWeight: "bold" }}>{item.properties.name || item.properties.formatted}</Text>
              <Text style={{ color: "#666", marginTop: 2 }}>{item.properties.formatted}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() =>
          query.length > 0 && !loading ? (
            <Text style={{ textAlign: "center", marginTop: 25, color: "#bbb" }}>
              No results found.
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

// ========== Place Details ==========
function PlaceDetailsScreen({ route, navigation }) {
  const { place } = route.params || {};
  const [distance, setDistance] = useState(null);
  const [weather, setWeather] = useState(null);
  const [aqi, setAqi] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [weatherModal, setWeatherModal] = useState(false);
  const [aqiModal, setAqiModal] = useState(false);
  useEffect(() => {
    if (!place) return;
    (async () => {
      if (place.currentLat && place.currentLon) {
        setDistance(
          haversineDistance(place.currentLat, place.currentLon, place.lat, place.lon).toFixed(2)
        );
      } else {
        let loc = await Location.getCurrentPositionAsync({});
        setDistance(
          haversineDistance(
            loc.coords.latitude,
            loc.coords.longitude,
            place.lat,
            place.lon
          ).toFixed(2)
        );
      }
      const res1 = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?lat=${place.lat}&lon=${place.lon}&appid=${WEATHER_API_KEY}&units=metric`
      );
      setWeather({
        temp: Math.round(res1.data.main.temp),
        desc: res1.data.weather[0].description,
        main: res1.data.weather[0].main,
        icon: res1.data.weather[0].icon,
      });
      const res2 = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${place.lat}&lon=${place.lon}&appid=${WEATHER_API_KEY}&units=metric`
      );
      setForecast(
        res2.data.list.slice(0, 8).map((item) => ({
          dt: item.dt_txt,
          temp: Math.round(item.main.temp),
          main: item.weather[0].main,
          icon: item.weather[0].icon,
        }))
      );
      const res3 = await axios.get(
        `https://api.waqi.info/feed/geo:${place.lat};${place.lon}/?token=${AIR_API_KEY}`
      );
      setAqi(res3.data?.data?.aqi ?? "-");
    })();
  }, [place]);
  if (!place) return <Text>Invalid Place</Text>;
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ padding: 17 }}>
        <Text style={{ fontSize: 22, fontWeight: "bold" }}>{place.name}</Text>
        <Text style={{ marginTop: 2, color: "#666" }}>{place.address}</Text>
        {distance && (
          <Text style={{ marginTop: 8, color: "#222", fontSize: 15 }}>
            Distance: <Text style={{ fontWeight: "bold" }}>{distance} km</Text>
          </Text>
        )}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-evenly", marginVertical: 7 }}>
        <TouchableOpacity onPress={() => setWeatherModal(true)}>
          <View style={[styles.infoPill, { borderColor: "#2196F3", borderWidth: 1, flexDirection: "row", minWidth: 110 }]}>
            <Image
              source={{ uri: `https://openweathermap.org/img/wn/${weather?.icon}@2x.png` }}
              style={{ width: 28, height: 28, marginRight: 9 }}
            />
            <Text style={[styles.infoText, { color: "#2196F3", fontSize: 17 }]}>
              {weather ? `${weather.temp}° | ${weather.main}` : "--"}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAqiModal(true)}>
          <View style={[styles.infoPill, { backgroundColor: aqiColor(aqi), flexDirection: "row", minWidth: 92 }]}>
            <MaterialIcons name="air" color="#fff" size={24} style={{ marginRight: 6 }} />
            <Text style={[styles.infoText, { marginLeft: 2, fontSize: 18 }]}>{aqi ?? "--"}</Text>
          </View>
        </TouchableOpacity>
      </View>
      <View style={{ alignItems: "center", marginTop: 18 }}>
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            navigation.navigate("Navigation", {
              start: null,
              end: place,
            })
          }
        >
          <Ionicons name="navigate-circle" size={25} color="#fff" style={{ marginRight: 10 }} />
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 19 }}>Navigate</Text>
        </TouchableOpacity>
      </View>
      <ForecastModal
        visible={weatherModal}
        onClose={() => setWeatherModal(false)}
        title="Weather Forecast"
        data={forecast.map((item) => ({
          label: item.dt.split(" ")[1].slice(0, 5),
          value: `${item.temp}°C`,
          icon: `https://openweathermap.org/img/wn/${item.icon}.png`,
        }))}
        desc={weather?.desc}
      />
      <ForecastModal
        visible={aqiModal}
        onClose={() => setAqiModal(false)}
        title="AQI at Location"
        desc={aqiLabel(aqi)}
        data={[]}
        isAqi
      />
    </View>
  );
}

// ========== Navigation ==========
function NavigationScreen({ route }) {
  const { end } = route.params;
  const [userLoc, setUserLoc] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [step, setStep] = useState(0);
  const [totalMin, setTotalMin] = useState(null);
  const [reportVisible, setReportVisible] = useState(false);
  const watchRef = useRef();

  useEffect(() => {
    (async () => {
      let loc = await Location.getCurrentPositionAsync({});
      const region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      };
      setUserLoc(region);
      const waypoints = [
        `${loc.coords.latitude},${loc.coords.longitude}`,
        `${end.lat},${end.lon}`,
      ];
      const routeURL = `https://api.geoapify.com/v1/routing?waypoints=${waypoints.join(
        "|"
      )}&mode=drive&steps=true&details=instructions&apiKey=${GEOAPIFY_API_KEY}`;
      const resp = await axios.get(routeURL);
      const feature = resp.data?.features?.[0];
      const coordsLonLat =
        feature.geometry.type === "LineString"
          ? feature.geometry.coordinates
          : feature.geometry.type === "MultiLineString"
          ? feature.geometry.coordinates.flat()
          : [];
      const latLng = coordsLonLat.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon,
      }));
      setRouteCoords(latLng);
      // Steps & ETA
      const legs = feature.properties?.legs || [];
      setTotalMin(legs.reduce((acc, leg) => acc + (leg?.duration ?? 0), 0) / 60); // min
      const allSteps = legs.flatMap((leg) =>
        (leg?.steps || []).map((s) => ({
          from_index: s.from_index,
          to_index: s.to_index,
          text: s?.instruction?.text || "",
          duration: s?.duration || 0,
        }))
      );
      setInstructions(allSteps);
      setStep(0);
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 10 },
        (l) => {
          setUserLoc((r) => ({
            ...r,
            latitude: l.coords.latitude,
            longitude: l.coords.longitude,
          }));
        }
      );
    })();
    return () => {
      if (watchRef.current) watchRef.current.remove();
    };
  }, []);
  return (
    <SafeAreaView style={styles.fullFlexWhite}>
      <View style={styles.dirHeadBanner}>
        <Text style={styles.dirHeadTxt}>DIRECTIONS</Text>
        <Text style={styles.dirStepTxt}>{instructions[step]?.text ?? "Arrived!"}</Text>
        {totalMin && <Text style={styles.dirEtaTxt}>{Math.round(totalMin)} min left</Text>}
      </View>
      <View style={{ flex: 1, borderRadius: 14, overflow: "hidden", margin: 3 }}>
        {userLoc && (
          <MapView
            style={{ flex: 1 }}
            region={userLoc}
            showsUserLocation
            followsUserLocation
            showsMyLocationButton
          >
            {routeCoords.length > 1 && (
              <Polyline coordinates={routeCoords} strokeColor="#2196F3" strokeWidth={7} />
            )}
            <Marker coordinate={userLoc} title="You" pinColor="#30b35e" />
            <Marker coordinate={{ latitude: end.lat, longitude: end.lon }} title="Destination" pinColor="#EF4444" />
          </MapView>
        )}
      </View>
      <View style={styles.dirBottomBar}>
        <TouchableOpacity
          style={styles.sosButton}
          onPress={() =>
            alert(
              "SOS Sent!\nEmergency alert sent with your current location."
            )
          }
        >
          <MaterialCommunityIcons name="alarm-light-outline" size={27} color="#f44336" />
          <Text style={{ color: "#f44336", fontWeight: "bold", fontSize: 19, marginLeft: 8 }}>SOS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.reportButton}
          onPress={() => setReportVisible(true)}
        >
          <MaterialIcons name="report-problem" size={23} color="#2196F3" />
          <Text style={{ color: "#2196F3", fontWeight: "bold", fontSize: 19, marginLeft: 8 }}>REPORT</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.dirFooterStrip}>
        <Ionicons name="close" size={21} color="#bbb" />
        {instructions[step]?.duration ? (
          <Text style={{ fontSize: 16, letterSpacing: 1 }}>{Math.round(instructions[step]?.duration / 60)} min</Text>
        ) : null}
        <Ionicons name="compass-outline" size={23} color="#2196F3" />
      </View>
      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} />
    </SafeAreaView>
  );
}

// ========== Modals/Utils ==========

function ForecastModal({ visible, onClose, title, data, desc, isAqi }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 13 }}>
            <TouchableOpacity onPress={onClose} style={{ marginRight: 9 }}>
              <Ionicons name="arrow-back" color="#2196F3" size={22} />
            </TouchableOpacity>
            <Text style={{ fontSize: 19, fontWeight: "bold", color: "#2196F3" }}>{title}</Text>
          </View>
          {!!desc && (
            <Text style={{ fontSize: 16, color: "#29477d", marginBottom: 9, fontWeight: "bold" }}>{desc}</Text>
          )}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={data}
            keyExtractor={(_, idx) => idx + ""}
            contentContainerStyle={{ marginTop: 10 }}
            renderItem={({ item }) => (
              <View style={{ alignItems: "center", marginHorizontal: 11 }}>
                <Text style={{ color: "#111", fontWeight: "bold" }}>{item.label}</Text>
                {item.icon ? (
                  <Image source={{ uri: item.icon }} style={{ width: 42, height: 42 }} />
                ) : isAqi ? (
                  <MaterialIcons name="air" size={31} color={aqiColor(item.value)} />
                ) : null}
                <Text style={{ fontSize: 17, marginTop: 2, color: "#2196F3" }}>{item.value}</Text>
              </View>
            )}
            ListEmptyComponent={() =>
              <Text style={{ color: "#bbb", marginTop: 13 }}>No forecast available</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

function ReportModal({ visible, onClose }) {
  const [incident, setIncident] = useState(null);
  const reportOptions = [
    { label: "Crash", icon: <FontAwesome5 name="car-crash" size={21} color="#2196F3" /> },
    { label: "Slowdown", icon: <MaterialIcons name="traffic" size={21} color="#2196F3" /> },
    { label: "Construction", icon: <MaterialCommunityIcons name="road-variant" size={21} color="#2196F3" /> },
    { label: "Lane Closure", icon: <MaterialIcons name="horizontal-split" size={21} color="#2196F3" /> },
    { label: "Object on Road", icon: <MaterialCommunityIcons name="alert-circle" size={21} color="#2196F3" /> },
  ];
  const sendReport = () => {
    if (!incident) {
      alert("Choose an incident");
      return;
    }
    alert(`Report Sent: ${incident}`);
    setIncident(null);
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 13 }}>
            <TouchableOpacity onPress={onClose} style={{ marginRight: 9 }}>
              <Ionicons name="arrow-back" color="#2196F3" size={22} />
            </TouchableOpacity>
            <Text style={{ fontSize: 19, fontWeight: "bold", color: "#2196F3" }}>Add a Report</Text>
          </View>
          <FlatList
            data={reportOptions}
            keyExtractor={(item) => item.label}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.repItem,
                  incident === item.label && { backgroundColor: "#e7efff" },
                ]}
                onPress={() => setIncident(item.label)}
              >
                <View style={styles.repIcon}>{item.icon}</View>
                <Text style={styles.repLabel}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={[styles.sendReportBtn, { opacity: incident ? 1 : 0.5 }]}
            onPress={sendReport}
            disabled={!incident}
          >
            <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>Send Report</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const Stack = createStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen name="PlaceDetails" component={PlaceDetailsScreen} />
          <Stack.Screen name="Navigation" component={NavigationScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ========== Styles ==========
const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  homeTopSearchBox: {
    position: "absolute",
    top: Platform.OS === "android" ? 30 : 40,
    alignSelf: "center",
    zIndex: 30,
    width: "89%",
    shadowColor: "#111",
    shadowOpacity: 0.10,
    shadowRadius: 7,
    elevation: 3,
  },
  fakeSearchBox: {
    backgroundColor: "#E8F0FE",
    borderRadius: 27,
    paddingVertical: 11,
    paddingHorizontal: 21,
    flexDirection: "row",
    alignItems: "center",
  },
  rightPillsContainer: {
    position: "absolute",
    right: 15,
    bottom: 108,
    zIndex: 13,
    alignItems: "flex-end",
  },
  infoPillWide: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 25,
    paddingVertical: 13,
    paddingHorizontal: 21,
    marginBottom: 5,
    minWidth: 123,
    backgroundColor: "#2196F3",
    elevation: 2,
    shadowColor: "#000",
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderTopWidth: 2,
    borderColor: "#e7e7e7",
    height: 64,
    alignItems: "center",
    paddingHorizontal: 30,
  },
  tabBtn: { alignItems: "center", justifyContent: "center", flex: 1 },
  firstSearchHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Platform.OS === "android" ? 27 : 22,
    paddingBottom: 13,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    zIndex: 30,
    borderBottomWidth: 1,
    borderColor: "#e3e8ee",
  },
  firstSearchInput: { flex: 1, marginLeft: 12, fontSize: 17, color: "#111" },
  resultItem: { flexDirection: "row", alignItems: "center", padding: 13, borderBottomWidth: 0.5, borderColor: "#e5e7eb" },
  fullFlexWhite: { flex: 1, backgroundColor: "#fff" },
  infoPill: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#fff", marginBottom: 8, minWidth: 60, minHeight: 37 },
  button: { flexDirection: "row", backgroundColor: "#2196F3", paddingHorizontal: 26, paddingVertical: 12, borderRadius: 13, alignItems: "center", marginTop: 7 },
  dirHeadBanner: { backgroundColor: "#fff", alignItems: "center", paddingTop: 41, paddingBottom: 7, borderBottomWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 1, marginBottom: 2 },
  dirHeadTxt: { fontSize: 22, fontWeight: "bold", color: "#2196F3", letterSpacing: 2 },
  dirStepTxt: { fontSize: 16, marginTop: 7, color: "#222", fontWeight: "500" },
  dirEtaTxt: { fontSize: 15, marginTop: 7, color: "#046" },
  dirBottomBar: { flexDirection: "row", justifyContent: "space-around", position: "absolute", bottom: 70, left: 0, right: 0, zIndex: 100, paddingHorizontal: 25 },
  sosButton: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 30, borderRadius: 30, borderWidth: 2, borderColor: "#f44336", backgroundColor: "#fff", marginRight: 9, elevation: 3 },
  reportButton: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 30, borderRadius: 30, borderWidth: 2, borderColor: "#2196F3", backgroundColor: "#fff", marginLeft: 9, elevation: 3 },
  dirFooterStrip: { position: "absolute", left: 0, right: 0, bottom: 13, height: 41, backgroundColor: "#fff", borderTopWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 23, zIndex: 100 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.13)", justifyContent: "flex-end"},
  modalCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: "#fff", padding: 23, minHeight: 160 },
  repItem: { flexDirection: "row", alignItems: "center", padding: 13, borderRadius: 10, marginBottom: 7 },
  repIcon: { marginRight: 13 }, repLabel: { fontSize: 16, color: "#222", fontWeight: "500" },
  sendReportBtn: { backgroundColor: "#2196F3", padding: 13, borderRadius: 13, alignItems: "center", marginTop: 14 },
});