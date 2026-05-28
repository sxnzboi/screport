// Firebase configuration for SCReport project
const firebaseConfig = {
    apiKey: "AIzaSyCOZzR8Y7anFHzlrIV7-JLVpZYyJhvxGVg",
    authDomain: "screport.firebaseapp.com",
    databaseURL: "https://screport-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "screport",
    storageBucket: "screport.firebasestorage.app",
    messagingSenderId: "1001993375102",
    appId: "1:1001993375102:web:b2af22c03ad2bc4c9e772f",
    measurementId: "G-S3Z4LENHSM"
};

let firebaseAppInitialized = false;

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    firebaseAppInitialized = true;
    console.log("Firebase App initialized successfully. Project: " + firebaseConfig.projectId);
} catch (error) {
    console.error("Firebase initialization error:", error);
}
