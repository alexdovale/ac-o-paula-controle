// js/auth.js - LOGIN E SEGURANÇA

import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export const handleLogin = async (auth, email, password) => {
    return await signInWithEmailAndPassword(auth, email, password);
};

export const handleRegister = async (auth, db, name, email, password) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        uid: user.uid,
        status: 'pending',
        role: 'user',
        createdAt: new Date().toISOString()
    });
    return user;
};

export const handleLogout = (auth) => signOut(auth);

export const handlePasswordReset = (auth, email) => sendPasswordResetEmail(auth, email);
