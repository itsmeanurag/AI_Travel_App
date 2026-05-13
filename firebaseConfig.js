// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCIqmjYQoh9XZD4t_NKn3Fr26bRbNoKS8U",
  authDomain: "natpactravelapp.firebaseapp.com",
  projectId: "natpactravelapp",
  storageBucket: "natpactravelapp.firebasestorage.app",
  messagingSenderId: "81146906946",
  appId: "1:81146906946:web:41c13691c4dcaf9d2ce0db",
  measurementId: "G-BVZ6VHP0CF"
};

// Initialize Firebase

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);