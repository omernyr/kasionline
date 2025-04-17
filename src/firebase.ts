// Firebase yapılandırması
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Firebase yapılandırma bilgileri - gerçek uygulamada bu bilgileri Firebase konsolundan almalısınız
const firebaseConfig = {
  apiKey: "AIzaSyAmlIYRK5NDg_rWRHx9Bt9LDYbvMcwdihg",
  authDomain: "kasi-online-4c876.firebaseapp.com",
  projectId: "kasi-online-4c876",
  storageBucket: "kasi-online-4c876.firebasestorage.app",
  messagingSenderId: "670560427151",
  appId: "1:670560427151:web:5b1de1a06a89962e17a4fa"
};

// Firebase'i başlat
const app = initializeApp(firebaseConfig);

// Firestore veritabanı referansı
export const db = getFirestore(app);

// Authentication referansı
export const auth = getAuth(app);

export default app; 