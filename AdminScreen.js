// AdminScreen.js
import React from "react";
import { View, Text, Image, ScrollView, StyleSheet } from "react-native";

export default function AdminScreen() {
  // Local images stored in same folder
  const images = [
    require("./WhatsApp Image 2025-09-19 at 13.01.30.jpeg"),
    require("./WhatsApp Image 2025-09-19 at 13.01.43.jpeg"),
    require("./WhatsApp Image 2025-09-19 at 13.01.53.jpeg"),
    require("./WhatsApp Image 2025-09-19 at 13.07.00.jpeg"),
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Admin Dashboard</Text>
      {images.map((img, idx) => (
        <Image
          key={idx}
          source={img}
          style={styles.image}
          resizeMode="contain"
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 20,
  },
  image: {
    width: 350,
    height: 250,
    marginBottom: 20,
    borderRadius: 10,
  },
});
