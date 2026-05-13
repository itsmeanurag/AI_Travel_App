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
  ScrollView,
  SafeAreaView,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Location from "expo-location";
import axios from "axios";
import {
  Ionicons,
  MaterialIcons,
  FontAwesome5,
  MaterialCommunityIcons,
  Entypo,
} from "@expo/vector-icons";

// ======= CONSTS & UTILS =======
const WEATHER_API_KEY = "806df16e1debfd430338d685e9bfa487";
const GEOAPIFY_API_KEY = "cdd25e128003407b8c836581f3bea685";
const AIR_API_KEY = "676df496ab6b9356fdad1b72758e1b104c57aa12";

const MOCKED_BOOKMARKS = [
  { name: "Ahmedabad", address: "Ahmedabad, Gujarat", lat: 23.0225, lon: 72.5714 },
  { name: "Surat", address: "Surat, Gujarat", lat: 21.1702, lon: 72.8311 },
  { name: "Vadodara", address: "Vadodara, Gujarat", lat: 22.3072, lon: 73.1812 },
  { name: "Rajkot", address: "Rajkot, Gujarat", lat: 22.3039, lon: 70.8022 },
  { name: "Connaught Place", address: "Connaught Place, New Delhi", lat: 28.6315, lon: 77.2167 },
  { name: "India Gate", address: "Rajpath, New Delhi", lat: 28.6129, lon: 77.2295 },
];

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
  const mapRef = useRef();

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
    setForecast(
      res2.data.list.slice(0, 8).map((item) => ({
        dt: item.dt_txt,
        temp: Math.round(item.main.temp),
        main: item.weather[0].main,
        icon: item.weather[0].icon,
      }))
    );
  }
  async function getAQI(lat, lon) {
    const res = await axios.get(
      `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${AIR_API_KEY}`
    );
    const aqidata = res?.data?.data ?? {};
    setAqi(aqidata.aqi || "-");
    setAqiForecast((aqidata.forecast?.daily?.pm25 ?? []).slice(0, 7));
  }

  const handleZoom = (delta) => {
    if (!region) return;
    const newDelta = Math.min(Math.max(0.002, region.latitudeDelta * delta), 1.5);
    setRegion({
      ...region,
      latitudeDelta: newDelta,
      longitudeDelta: newDelta,
    });
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        { ...region, latitudeDelta: newDelta, longitudeDelta: newDelta },
        180
      );
    }
  };

  if (!region || !weather)
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#2196F3" size="large" />
      </View>
    );
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* SEARCH BAR (TOP, FULL WIDTH) */}
      <View style={styles.homeSearchBarContainer}>
        <TouchableOpacity
          style={styles.fullSearchBox}
          onPress={() => navigation.navigate("TripPlannerSearch")}
        >
          <Ionicons name="search" size={24} color="#2196F3" />
          <Text style={{ marginLeft: 10, color: "#888", fontSize: 17, flex:1 }}>
            Where to?
          </Text>
        </TouchableOpacity>
      </View>
      {/* TRAVEL PROFILER (below search, half-width) */}
      <View style={styles.profilerHalfWidthWrap}>
        <TouchableOpacity
          style={styles.travelProfilerBox}
          onPress={() => navigation.navigate("TravelProfiler")}
        >
          <MaterialIcons name="person-pin" size={21} color="#1e2349" />
          <Text style={{ marginLeft: 7, color: "#1e2349", fontSize: 16, fontWeight: "800" }}>Travel Profiler</Text>
        </TouchableOpacity>
      </View>
      {/* Map + zoom controls */}
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          region={region}
          showsUserLocation
        >
          <Marker coordinate={region} title="Your Location" />
        </MapView>
        {/* Zoom Buttons */}
        <View style={styles.zoomContainer}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => handleZoom(0.6)}>
            <Entypo name="plus" size={24} color="#222" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => handleZoom(1.6)}>
            <Entypo name="minus" size={24} color="#222" />
          </TouchableOpacity>
        </View>
      </View>
      {/* AQI/Weather pills */}
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
        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => navigation.navigate("BookmarksList")}
        >
          <Ionicons name="bookmark" size={29} color="#2196F3" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabBtn}
          onPress={() => navigation.navigate("TripPlannerSearch")}
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

// ========== Bookmarks List Screen ==========
function BookmarksListScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.fullFlexWhite}>
      <View style={{
        flexDirection:'row', alignItems:'center', padding:18, borderBottomWidth:1, borderColor:"#e7e7e7"
      }}>
        <TouchableOpacity onPress={()=>navigation.goBack()}>
          <Ionicons name="arrow-back" size={25} color="#2196F3" />
        </TouchableOpacity>
        <Text style={{fontWeight:'bold', fontSize:19, marginLeft:13}}>Bookmarked & Nearby Places</Text>
      </View>
      <FlatList
        data={MOCKED_BOOKMARKS}
        keyExtractor={(item,idx) => item.name+idx}
        renderItem={({item}) => (
          <TouchableOpacity
            style={styles.bookmarkItem}
            onPress={() => navigation.navigate("PlaceDetails", { place: item })}
          >
            <Ionicons name="location-outline" size={22} color="#2196F3" />
            <View style={{ marginLeft: 7 }}>
              <Text style={{ fontWeight: "bold", fontSize: 16 }}>{item.name}</Text>
              <Text style={{ color: "#888", fontSize: 13, marginTop: 1 }}>{item.address}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{textAlign:'center', color:'#bbb', marginTop:40}}>No bookmarks found.</Text>}
        contentContainerStyle={{padding:15}}
      />
    </SafeAreaView>
  );
}

// ========== Trip Planner Search Screen ==========
function TripPlannerSearchScreen({ navigation }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [activeField, setActiveField] = useState("to");
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [fetchingLoc, setFetchingLoc] = useState(false);

  useEffect(()=> {
    setFetchingLoc(true);
    Location.getCurrentPositionAsync({}).then(loc=>{
      setFrom({
        name:"Current Location",
        address: "Detected by GPS",
        lat: loc.coords.latitude,
        lon: loc.coords.longitude
      });
      setFetchingLoc(false);
    }).catch(()=> setFetchingLoc(false));
  }, []);
  
  useEffect(()=>{
    if (activeField === "from" && fromQuery.length >= 2) {
      axios.get(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(fromQuery)}&apiKey=${GEOAPIFY_API_KEY}&limit=8`)
      .then(r => setFromSuggestions(r.data?.features || []));
    }
  }, [fromQuery, activeField]);
  useEffect(()=>{
    if (activeField === "to" && toQuery.length >= 2) {
      axios.get(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(toQuery)}&apiKey=${GEOAPIFY_API_KEY}&limit=8`)
      .then(r => setToSuggestions(r.data?.features || []));
    }
  }, [toQuery, activeField]);

  const handlePickFrom = (item) => {
    setFrom({
      name: item.properties.name || item.properties.formatted,
      address: item.properties.formatted,
      lat: item.properties.lat ?? item.geometry.coordinates[1],
      lon: item.properties.lon ?? item.geometry.coordinates[0],
    });
    setActiveField("to");
    setFromQuery("");
    setFromSuggestions([]);
  }
  const handlePickTo = (item) => {
    setTo({
      name: item.properties.name || item.properties.formatted,
      address: item.properties.formatted,
      lat: item.properties.lat ?? item.geometry.coordinates[1],
      lon: item.properties.lon ?? item.geometry.coordinates[0],
    });
    setToQuery("");
    setToSuggestions([]);
  }

  useEffect(()=>{
    if (from && to) {
      navigation.replace("TripSummary", { start: from, end: to });
    }
  },[from, to]);

  return (
    <SafeAreaView style={styles.fullFlexWhite}>
      <View style={{
        paddingTop:Platform.OS==="android"?29:19,
        paddingHorizontal:14,
        backgroundColor:"#fff",
        borderBottomWidth:1, borderColor:"#e2e2e3",
        zIndex:10
      }}>
        <Text style={{fontWeight:"bold", fontSize:18, color:"#2196F3", marginBottom:9}}>Trip Planner</Text>
        <TouchableOpacity
          style={[styles.triplocInputRow, activeField==="from" && { borderColor:'#2196F3', backgroundColor:'#eafeff'}]}
          onPress={()=>setActiveField("from")}
        >
          <Ionicons name="locate" size={20} color="#2196F3" />
          <TextInput
            style={styles.triplocInput}
            onFocus={()=>setActiveField("from")}
            value={from ? from.name : fromQuery}
            onChangeText={v=>
              {setFromQuery(v); setFrom(null);}
            }
            placeholder={fetchingLoc?"Detecting current location...":"Start location"}
            editable={true}
            autoFocus={activeField==="from"}
          />
        </TouchableOpacity>
        {activeField==="from" && fromQuery.length>=2 && (
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={fromSuggestions}
            keyExtractor={(item, idx) => `${item.properties.place_id}-${idx}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchSugRow}
                onPress={() => handlePickFrom(item)}
              >
                <Ionicons name="location" size={20} color="#2196F3" style={{marginRight:6}} />
                <Text>{item.properties.name || item.properties.formatted}</Text>
              </TouchableOpacity>
            )}
          />
        )}
        <TouchableOpacity
          style={[styles.triplocInputRow, activeField==="to" && { borderColor:'#2196F3', backgroundColor:'#eafeff'}]}
          onPress={()=>setActiveField("to")}
        >
          <Ionicons name="flag" size={20} color="#f44336" />
          <TextInput
            style={styles.triplocInput}
            onFocus={()=>setActiveField("to")}
            value={to ? to.name : toQuery}
            onChangeText={v=>{
              setToQuery(v); setTo(null);
            }}
            placeholder="Destination"
            editable={true}
            autoFocus={activeField==="to"}
          />
        </TouchableOpacity>
        {activeField==="to" && toQuery.length>=2 && (
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={toSuggestions}
            keyExtractor={(item, idx) => `${item.properties.place_id}-${idx}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchSugRow}
                onPress={() => handlePickTo(item)}
              >
                <Ionicons name="location" size={20} color="#2196F3" style={{marginRight:6}} />
                <Text>{item.properties.name || item.properties.formatted}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
      <View style={{flex:1, backgroundColor:"#f6f9fd"}} />
    </SafeAreaView>
  );
}

// ========== TripSummaryScreen ==========
function TripSummaryScreen({ navigation, route }) {
  const { start, end } = route.params;
  const [sWeather, setSWeather] = useState(null); const [sAQI, setSAQI] = useState(null);
  const [eWeather, setEWeather] = useState(null); const [eAQI, setEAQI] = useState(null);
  const [mode, setMode] = useState("car");
  useEffect(() => {
    async function fetch() {
      const [w1, a1, w2, a2] = await Promise.all([
        axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${start.lat}&lon=${start.lon}&appid=${WEATHER_API_KEY}&units=metric`),
        axios.get(`https://api.waqi.info/feed/geo:${start.lat};${start.lon}/?token=${AIR_API_KEY}`),
        axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${end.lat}&lon=${end.lon}&appid=${WEATHER_API_KEY}&units=metric`),
        axios.get(`https://api.waqi.info/feed/geo:${end.lat};${end.lon}/?token=${AIR_API_KEY}`),
      ]);
      setSWeather({ temp: Math.round(w1.data.main.temp), main: w1.data.weather[0].main });
      setSAQI(a1.data?.data?.aqi ?? "-");
      setEWeather({ temp: Math.round(w2.data.main.temp), main: w2.data.weather[0].main });
      setEAQI(a2.data?.data?.aqi ?? "-");
    }
    fetch();
  }, [start, end]);

  const icons = {
    car: <MaterialCommunityIcons name="car" size={29} color="#2196F3" />,
    bike: <MaterialCommunityIcons name="bike" size={29} color="#C026D3" />,
    bus: <MaterialCommunityIcons name="bus" size={27} color="#10B981" />,
    metro: <MaterialCommunityIcons name="train-variant" size={28} color="#7C3AED" />,
    train: <MaterialCommunityIcons name="train" size={28} color="#29477d" />,
    walk: <MaterialCommunityIcons name="walk" size={28} color="#F59E0B" />,
  };

  return (
    <SafeAreaView style={styles.fullFlexWhite}>
      <Text style={{ fontSize:18, fontWeight: 'bold', margin:21 }}>Your trip summary</Text>
      <View style={styles.journeyCard}>
        <View style={{ marginBottom: 13 }}>
          <Ionicons name="locate" size={18} color="#2196F3" />
          <Text style={{ fontWeight:'bold', fontSize:16, marginTop:3 }}>{start.name}</Text>
          <Text style={{fontSize:13, color:'#555'}}>{start.address}</Text>
          <Text style={{fontSize:14, marginTop:3}}>Weather: {sWeather ? `${sWeather.temp}°C, ${sWeather.main}` : "--"}</Text>
          <Text style={{fontSize:14}}>AQI: {sAQI ?? "--"}</Text>
        </View>
        <View>
          <Ionicons name="flag" size={18} color="#f44336" />
          <Text style={{ fontWeight:'bold', fontSize:16, marginTop:3 }}>{end.name}</Text>
          <Text style={{fontSize:13, color:'#555'}}>{end.address}</Text>
          <Text style={{fontSize:14, marginTop:3}}>Weather: {eWeather ? `${eWeather.temp}°C, ${eWeather.main}` : "--"}</Text>
          <Text style={{fontSize:14}}>AQI: {eAQI ?? "--"}</Text>
        </View>
      </View>
      <Text style={{ margin:14, fontWeight:'bold' }}>Mode of Travel</Text>
      <View style={{ flexDirection:'row', justifyContent:'space-evenly', alignItems:'center', marginHorizontal:20 }}>
        {Object.keys(icons).map((m) => (
          <TouchableOpacity key={m}
            style={[styles.modeBtn, m === mode && { backgroundColor:'#daf0fa', borderColor:"#2196F3" }]}
            onPress={()=>setMode(m)}>{icons[m]}</TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.continueBtn} onPress={() =>
        navigation.navigate("Navigation", { start, end, mode })
      }>
        <Ionicons name="navigate-circle" size={25} color="#fff" style={{ marginRight: 10 }} />
        <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 19 }}>Start Navigation</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ========== Placeholder ==========
function TravelProfilerScreen() {
  return (
    <SafeAreaView style={styles.fullFlexWhite}>
      <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
        <MaterialIcons name="person-pin" size={56} color="#2196F3" />
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginTop: 12 }}>Travel Profiler</Text>
        <Text style={{ color: "#888", fontSize: 15, marginTop: 13 }}>Coming soon!</Text>
      </View>
    </SafeAreaView>
  );
}
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

function NavigationScreen({ route }) {
  const { start, end, mode } = route.params ?? {};
  const [userLoc, setUserLoc] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [step, setStep] = useState(0);
  const [totalMin, setTotalMin] = useState(null);
  const [forecastVisible, setForecastVisible] = useState(false);
  const [forecastData, setForecastData] = useState([]);
  const [reportVisible, setReportVisible] = useState(false);
  const watchRef = useRef();

  useEffect(() => {
    (async () => {
      let startLoc = start;
      if (!startLoc) {
        let loc = await Location.getCurrentPositionAsync({});
        startLoc = { lat: loc.coords.latitude, lon: loc.coords.longitude };
      }
      let endLoc = end;
      if (!endLoc) return;
      const region = {
        latitude: startLoc.lat,
        longitude: startLoc.lon,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      };
      setUserLoc(region);
      const waypoints = [
        `${startLoc.lat},${startLoc.lon}`,
        `${endLoc.lat},${endLoc.lon}`,
      ];
      let routeMode = "drive";
      if (mode === "car") routeMode = "drive";
      if (mode === "bike") routeMode = "bicycle";
      if (mode === "walk") routeMode = "walk";
      if (mode === "bus" || mode === "metro" || mode === "train") routeMode = "transit";
      
      // fetch route and forecast
      const routeURL = `https://api.geoapify.com/v1/routing?waypoints=${waypoints.join(
        "|"
      )}&mode=${routeMode}&steps=true&details=instructions&apiKey=${GEOAPIFY_API_KEY}`;
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
      setTotalMin(legs.reduce((acc, leg) => acc + (leg?.duration ?? 0), 0) / 60);
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

      // Forecast, only for end location as an example
      const forecastRes = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${endLoc.lat}&lon=${endLoc.lon}&appid=${WEATHER_API_KEY}&units=metric`
      );
      setForecastData(
        forecastRes.data.list.slice(0, 8).map((item) => ({
          label: item.dt_txt.split(" ")[1].slice(0, 5),
          value: `${Math.round(item.main.temp)}°C`,
          icon: `https://openweathermap.org/img/wn/${item.weather[0].icon}.png`,
        }))
      );

      // Location watch to update your position in real time
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
    <SafeAreaView style={navStyles.flex1}>
      {/* Directions banner */}
      <View style={navStyles.directionBanner}>
        <Text style={navStyles.directionsTitle}>DIRECTIONS</Text>
        <Text style={navStyles.directionsStep} numberOfLines={2} adjustsFontSizeToFit>
          {instructions[step]?.text ?? "Arrived!"}
        </Text>
        {totalMin != null && <Text style={navStyles.directionsETA}>{Math.round(totalMin)} min left</Text>}
      </View>
      {/* Map area */}
      <View style={navStyles.flex1MapWrap}>
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
        {/* Open Forecast Button (fixed floating, right) */}
        <TouchableOpacity style={navStyles.forecastBtn} onPress={() => setForecastVisible(true)}>
          <MaterialIcons name="wb-sunny" size={25} color="#FFA000" />
          <Text style={{ marginLeft: 7, color: "#333", fontWeight: "bold" }}>Forecast</Text>
        </TouchableOpacity>
      </View>
      {/* Report and SOS buttons - fixed at bottom left/right */}
      <View style={navStyles.bottomButtonBar}>
        <TouchableOpacity
          style={navStyles.sosButton}
          onPress={() => alert("SOS Sent!\nEmergency alert sent with your current location.")}
        >
          <MaterialCommunityIcons name="alarm-light-outline" size={27} color="#f44336" />
          <Text style={navStyles.sosTxt}>SOS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={navStyles.reportButton}
          onPress={() => setReportVisible(true)}
        >
          <MaterialIcons name="report-problem" size={25} color="#2196F3" />
          <Text style={navStyles.reportTxt}>REPORT</Text>
        </TouchableOpacity>
      </View>
      {/* Turn/ETA bar */}
      <View style={navStyles.bottomStrip}>
        <Ionicons name="close" size={21} color="#bbb" />
        {instructions[step]?.duration ? (
          <Text style={navStyles.bottomStripText}>{Math.round(instructions[step]?.duration / 60)} min</Text>
        ) : null}
        <Ionicons name="compass-outline" size={23} color="#2196F3" />
      </View>
      {/* Forecast and Report modals */}
      <ForecastModal
        visible={forecastVisible}
        onClose={() => setForecastVisible(false)}
        title="Weather Forecast"
        data={forecastData}
        desc=""
      />
      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} />
    </SafeAreaView>
  );
}

function ForecastModal({ visible, onClose, title, data, desc }) {
  // Display as fixed bottom-sheet, not full modal
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={navStyles.modalOverlayNoFull}>
        <View style={navStyles.bottomSheet}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 11 }}>
            <TouchableOpacity onPress={onClose} style={{ marginRight: 8 }}>
              <Ionicons name="arrow-back" color="#2196F3" size={21} />
            </TouchableOpacity>
            <Text style={{ fontWeight: "bold", color: "#2196F3", fontSize: 17 }}>{title}</Text>
          </View>
          {!!desc && <Text style={navStyles.descText}>{desc}</Text>}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={data}
            keyExtractor={(_, idx) => idx + ""}
            contentContainerStyle={{ marginTop: 6, paddingBottom: 4 }}
            renderItem={({ item }) => (
              <View style={navStyles.forecastItem}>
                <Text style={navStyles.forecastLabel}>{item.label}</Text>
                {item.icon && (
                  <Image source={{ uri: item.icon }} style={{ width: 38, height: 38 }} />
                )}
                <Text style={navStyles.forecastVal}>{item.value}</Text>
              </View>
            )}
            ListEmptyComponent={() =>
              <Text style={{ color: "#bbb", marginTop: 7, marginBottom: 9 }}>No forecast available</Text>
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
      <View style={navStyles.modalOverlayNoFull}>
        <View style={navStyles.bottomSheetReport}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 13 }}>
            <TouchableOpacity onPress={onClose} style={{ marginRight: 8 }}>
              <Ionicons name="arrow-back" color="#2196F3" size={21} />
            </TouchableOpacity>
            <Text style={{ fontWeight: "bold", color: "#2196F3", fontSize: 17 }}>Add a Report</Text>
          </View>
          <FlatList
            data={reportOptions}
            keyExtractor={(item) => item.label}
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  navStyles.reportListItem,
                  incident === item.label && { backgroundColor: "#e7efff", borderColor: "#2196F3" },
                ]}
                onPress={() => setIncident(item.label)}
                activeOpacity={0.85}
              >
                <View style={navStyles.repIcon}>{item.icon}</View>
                <Text style={navStyles.repLabel}>{item.label}</Text>
                {incident === item.label && <MaterialIcons name="check-circle" color="#2196F3" size={20} style={{ marginLeft: 10 }} />}
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={[navStyles.sendReportBtn, { opacity: incident ? 1 : 0.65 }]}
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

// ========== NAVIGATION STACK ==========
const Stack = createStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="BookmarksList" component={BookmarksListScreen} />
          <Stack.Screen name="TripPlannerSearch" component={TripPlannerSearchScreen} />
          <Stack.Screen name="TripSummary" component={TripSummaryScreen} />
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen name="PlaceDetails" component={PlaceDetailsScreen} />
          <Stack.Screen name="Navigation" component={NavigationScreen} />
          <Stack.Screen name="TravelProfiler" component={TravelProfilerScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ========== STYLES ==========
const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  homeSearchBarContainer: {
    marginTop: Platform.OS === 'android' ? 35 : 48,
    paddingHorizontal: 13,
    paddingBottom: 8,
    backgroundColor: '#fff',
    zIndex: 15,
  },

  fullSearchBox: {
    backgroundColor: '#E8F0FE',
    borderRadius: 27,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    width: '100%',
    elevation: 2,
    shadowColor: "#2196F3",
    shadowOpacity: 0.05,
  },

  profilerHalfWidthWrap: {
    width: '51%',
    paddingLeft: 13,
    paddingBottom: 12,
    zIndex: 7,
  },

  travelProfilerBox: {
    backgroundColor: "#EDEFFF",
    borderRadius: 19,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    width: '99%',
    paddingHorizontal: 14,
    elevation: 2,
    shadowColor: "#2296F3",
    shadowOpacity: 0.06,
  },

  zoomContainer: {
    position: "absolute",
    left: 15,
    bottom: 110,
    flexDirection: "column",
    borderRadius: 25,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: "#000",
    zIndex: 45
  },

  zoomBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6fa",
    margin: 6,
    borderRadius: 17,
    width: 37,
    height: 37,
    borderWidth: 1,
    borderColor: "#d4dbed"
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

  tabBtn: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1
  },

  bookmarkItem: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#fff4d6',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 13,
    marginBottom: 11,
    marginRight: 13,
    elevation: 1,
  },

  triplocInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F8FF',
    borderRadius: 13,
    marginVertical: 8,
    paddingVertical: 13,
    paddingHorizontal: 19,
    width: "100%",
    borderWidth: 2,
    borderColor: '#f2f8ff'
  },

  triplocInput: {
    fontSize: 17,
    color: '#222',
    flex: 1,
    marginLeft: 11
  },

  searchSugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 0.7,
    borderColor: '#eee'
  },

  fullFlexWhite: { flex: 1, backgroundColor: "#fff" },

  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fff",
    marginBottom: 8,
    minWidth: 60,
    minHeight: 37
  },

  button: {
    flexDirection: "row",
    backgroundColor: "#2196F3",
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 13,
    alignItems: "center",
    marginTop: 7
  },

  journeyCard: {
    margin: 18,
    padding: 17,
    backgroundColor: '#f6f8ff',
    borderRadius: 17,
    elevation: 2,
  },

  modeBtn: {
    backgroundColor: '#f1f2f3',
    borderRadius: 10,
    padding: 11,
    marginHorizontal: 5,
    borderWidth: 2,
    borderColor: '#e0e0e2'
  },

  continueBtn: {
    margin: 22,
    marginTop: 38,
    flexDirection: 'row',
    backgroundColor: "#2196F3",
    paddingHorizontal: 34,
    paddingVertical: 15,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: 'center',
  }
});
const navStyles = StyleSheet.create({
  flex1: {
    flex: 1,
    backgroundColor: "#fff",
  },

  directionBanner: {
    paddingVertical: 18,
    paddingHorizontal: 15,
    backgroundColor: "#e8f1ff",
    borderBottomWidth: 1,
    borderColor: "#d0d7e6",
    alignItems: "center",   // ⬅ Center everything
  },

  directionsTitle: {
    color: "#2196F3",
    fontWeight: "bold",
    fontSize: 18,   // ⬅ Slightly bigger
    marginBottom: 6,
  },

  directionsStep: {
    fontSize: 17,   // ⬅ Slightly bigger
    color: "#333",
    textAlign: "center",   // ⬅ Center text
    width: "90%",
  },

  directionsETA: {
    marginTop: 6,
    color: "#444",
    fontSize: 15,
    fontWeight: "600",
  },

  flex1MapWrap: {
    flex: 1,
    backgroundColor: "#fff",
  },

  forecastBtn: {
    position: "absolute",
    right: 15,
    top: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 24,
    elevation: 3,
  },

  bottomButtonBar: {
    position: "absolute",
    bottom: 70,
    left: 15,
    right: 15,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  // ⬇ SOS BUTTON IMPROVED SIZE
  sosButton: {
    flexDirection: "row",
    backgroundColor: "#ffe7e7",
    paddingVertical: 15,     // increased
    paddingHorizontal: 18,   // increased
    borderRadius: 16,        // slightly larger radius
    borderWidth: 1,
    borderColor: "#f5b5b5",
    alignItems: "center",
    elevation: 2,            // slight shadow for better visibility
  },

  sosTxt: {
    marginLeft: 10,
    fontWeight: "bold",
    color: "#f44336",
    fontSize: 16,            // slightly bigger text
  },

  // ⬇ REPORT BUTTON IMPROVED SIZE
  reportButton: {
    flexDirection: "row",
    backgroundColor: "#e8f1ff",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#b7d4ff",
    alignItems: "center",
  },

  reportTxt: {
    marginLeft: 8,
    fontWeight: "bold",
    color: "#2196F3",
    fontSize: 15,
  },

  bottomStrip: {
    height: 58,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#ddd",
  },

  bottomStripText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },

  modalOverlayNoFull: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  bottomSheet: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopRightRadius: 22,
    borderTopLeftRadius: 22,
  },

  bottomSheetReport: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopRightRadius: 22,
    borderTopLeftRadius: 22,
    maxHeight: "70%",
  },

  descText: {
    color: "#555",
    fontSize: 14,
    marginBottom: 10,
  },

  forecastItem: {
    backgroundColor: "#f3f7ff",
    padding: 12,
    borderRadius: 14,
    marginRight: 10,
    alignItems: "center",
  },

  forecastLabel: {
    color: "#444",
    fontSize: 13,
    marginBottom: 3,
  },

  forecastVal: {
    color: "#222",
    fontWeight: "bold",
    fontSize: 16,
    marginTop: 2,
  },

  reportListItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginBottom: 10,
  },

  repIcon: {
    marginRight: 10,
  },

  repLabel: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },

  sendReportBtn: {
    backgroundColor: "#2196F3",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
});