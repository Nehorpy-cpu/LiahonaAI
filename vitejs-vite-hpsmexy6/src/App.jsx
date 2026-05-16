import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, signOut, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, getDoc 
} from 'firebase/firestore';
import { 
  BookOpen, Mic, Edit3, Trash2, Wand2, Plus, Folder, Menu, X, 
  ChevronRight, Link as LinkIcon, LogOut, User, ShieldAlert, Globe, Phone,
  GraduationCap, Sparkles, BookMarked
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE Y ENTORNO ---
// Integramos tus credenciales directamente como respaldo para cuando copies este código a StackBlitz.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyAvpfyDnu1qeCCjbEZopP5o7gfrA7THa54",
  authDomain: "liahonaai-328a6.firebaseapp.com",
  projectId: "liahonaai-328a6",
  storageBucket: "liahonaai-328a6.firebasestorage.app",
  messagingSenderId: "323033380029",
  appId: "1:323033380029:web:0e158e0c1d62e44eca33d4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Sanitizamos el appId reemplazando barras (/) por guiones bajos (_) para evitar el error de "número impar de segmentos" en las referencias de documentos.
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'liahonaai-328a6';
const appId = rawAppId.replace(/\//g, '_'); 

// --- CONFIGURACIÓN IA (GEMINI) ---
// IMPORTANTE: En el Canvas esta variable debe estar vacía, pero cuando copies el código a StackBlitz, 
// pega tu clave dentro de las comillas vacías: "AIzaSyAio7Sl-uGwxiwSyRzg4KaCZmxx4iskL28"
const apiKey = ""; 

export default function App() {
  // Estados de Sesión y Perfil
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authView, setAuthView] = useState('login'); // 'login', 'register', 'app', 'admin'
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Navegación Principal
  const [appMode, setAppMode] = useState('tableros'); // 'tableros' | 'estudio'

  // Estados de la App (Tableros)
  const [temas, setTemas] = useState([]);
  const [notas, setNotas] = useState([]);
  const [temaActivoId, setTemaActivoId] = useState(null);
  
  // Estados de la App (Portal Estudio Profundo)
  const [estudios, setEstudios] = useState([]);
  const [estudioActivoId, setEstudioActivoId] = useState(null);
  const [nuevoTemaEstudio, setNuevoTemaEstudio] = useState('');
  const [isGeneratingStudy, setIsGeneratingStudy] = useState(false);

  // Estados de la Interfaz
  const [isSearching, setIsSearching] = useState(false);
  const [nuevoTemaNombre, setNuevoTemaNombre] = useState('');
  const [nuevaNotaTexto, setNuevaNotaTexto] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [fuenteFiltro, setFuenteFiltro] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Estados para Registro y Login
  const [regData, setRegData] = useState({ nombre: '', email: '', password: '', pais: '', whatsapp: '' });
  const [loginData, setLoginData] = useState({ email: '', password: '' });

  // Estados para Panel Admin
  const [allUsers, setAllUsers] = useState([]);

  // --- 1. INICIALIZACIÓN Y AUTENTICACIÓN SEGURA ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Error de autenticación inicial:", e);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const profileRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'data');
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          setUserProfile(profileSnap.data());
          setAuthView('app');
        } else {
          setAuthView('register');
          setUserProfile(null);
        }
      } else {
        setAuthView('login');
        setUserProfile(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- 2. SINCRONIZACIÓN DE DATOS (Aislados por Usuario) ---
  useEffect(() => {
    if (!user || (authView !== 'app' && authView !== 'admin')) return;

    // Escuchar Carpetas (Tableros)
    const temasRef = collection(db, 'artifacts', appId, 'users', user.uid, 'temas');
    const unsubTemas = onSnapshot(temasRef, (snapshot) => {
      const temasDb = [];
      snapshot.forEach((doc) => temasDb.push({ id: doc.id, ...doc.data() }));
      temasDb.sort((a, b) => b.timestamp - a.timestamp);
      setTemas(temasDb);
      if (!temaActivoId && temasDb.length > 0) setTemaActivoId(temasDb[0].id);
    });

    // Escuchar Notas
    const notasRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notas');
    const unsubNotas = onSnapshot(notasRef, (snapshot) => {
      const notasDb = [];
      snapshot.forEach((doc) => notasDb.push({ id: doc.id, ...doc.data() }));
      notasDb.sort((a, b) => b.timestamp - a.timestamp);
      setNotas(notasDb);
    });

    // Escuchar Estudios Profundos
    const estudiosRef = collection(db, 'artifacts', appId, 'users', user.uid, 'estudios');
    const unsubEstudios = onSnapshot(estudiosRef, (snapshot) => {
      const estudiosDb = [];
      snapshot.forEach((doc) => estudiosDb.push({ id: doc.id, ...doc.data() }));
      estudiosDb.sort((a, b) => b.timestamp - a.timestamp);
      setEstudios(estudiosDb);
      if (!estudioActivoId && estudiosDb.length > 0) setEstudioActivoId(estudiosDb[0].id);
    });

    return () => { unsubTemas(); unsubNotas(); unsubEstudios(); };
  }, [user, authView]);

  // --- 3. FUNCIONES DE AUTENTICACIÓN ---
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!regData.nombre || !regData.email || !regData.password || !regData.pais || !regData.whatsapp) {
      setAuthError('Por favor, completa todos los campos.'); return;
    }
    setAuthLoading(true);

    const asignRole = regData.email.toLowerCase().includes('admin') ? 'admin' : 'user';
    const profileData = {
      nombre: regData.nombre, email: regData.email, pais: regData.pais,
      whatsapp: regData.whatsapp, role: asignRole, createdAt: Date.now()
    };

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, regData.email, regData.password);
      const newUser = userCredential.user;
      await setDoc(doc(db, 'artifacts', appId, 'users', newUser.uid, 'profile', 'data'), profileData);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'userDirectory', newUser.uid), profileData);
      setUserProfile(profileData); setAuthView('app'); showToast('Cuenta creada con éxito. ¡Bienvenido!');
    } catch (error) {
      if (error.code === 'auth/operation-not-allowed') {
        try {
          let currentUid = user?.uid;
          if (!currentUid) {
            const anon = await signInAnonymously(auth); currentUid = anon.user.uid;
          }
          await setDoc(doc(db, 'artifacts', appId, 'users', currentUid, 'profile', 'data'), profileData);
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'userDirectory', currentUid), profileData);
          setUserProfile(profileData); setAuthView('app'); showToast('Cuenta de prueba creada.');
        } catch (fallbackError) { setAuthError('Error de conexión en modo prueba.'); }
      } else {
        setAuthError('Error al registrar: ' + (error.message.includes('email-already-in-use') ? 'El correo ya está registrado.' : 'Revisa tus datos e intenta de nuevo.'));
      }
    }
    setAuthLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError(''); setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginData.email, loginData.password);
      showToast('Sesión iniciada correctamente.');
    } catch (error) {
      if (error.code === 'auth/operation-not-allowed') {
        setAuthError('Estás en un entorno de prueba. Por favor, usa la opción "Regístrate aquí".');
      } else { setAuthError('Credenciales incorrectas o usuario no encontrado.'); }
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth); setTemaActivoId(null); setEstudioActivoId(null);
    try { await signInAnonymously(auth); } catch (e) {}
  };

  const showToast = (msg) => {
    setToastMsg(msg); setTimeout(() => setToastMsg(''), 4000);
  };

  const loadAdminData = async () => {
    if (userProfile?.role !== 'admin') return;
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'userDirectory');
    onSnapshot(usersRef, (snapshot) => {
      const uList = []; snapshot.forEach(doc => uList.push({ uid: doc.id, ...doc.data() }));
      setAllUsers(uList);
    });
  };

  // --- 4. LÓGICA DE TABLEROS (RECOPILACIÓN) ---
  const crearTema = async (e) => {
    e.preventDefault();
    if (!user || !nuevoTemaNombre.trim()) return;
    const temasRef = collection(db, 'artifacts', appId, 'users', user.uid, 'temas');
    const docRef = await addDoc(temasRef, { nombre: nuevoTemaNombre.trim(), timestamp: Date.now() });
    setNuevoTemaNombre(''); setTemaActivoId(docRef.id);
  };

  const eliminarTema = async (id, e) => {
    e.stopPropagation();
    if (!user || !window.confirm("¿Estás seguro de eliminar este archivo?")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'temas', id));
    if (temaActivoId === id) setTemaActivoId(temas.filter(t => t.id !== id)[0]?.id || null);
    showToast('Archivo eliminado.');
  };

  const agregarNotaManual = async (e) => {
    e.preventDefault();
    if (!user || !nuevaNotaTexto.trim() || !temaActivoId) return;
    const notasRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notas');
    await addDoc(notasRef, {
      temaId: temaActivoId, contenido: nuevaNotaTexto.trim(), fuente: 'Impresión Personal', tipo: 'notaPersonal', timestamp: Date.now()
    });
    setNuevaNotaTexto(''); showToast('Impresión guardada.');
  };

  const eliminarNota = async (id) => {
    if (!user) return; await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'notas', id));
  };

  const pedirSugerenciasIA = async () => {
    const temaActivo = temas.find(t => t.id === temaActivoId);
    if (!user || !temaActivo || isSearching) return;
    setIsSearching(true);

    const citasActuales = notas.filter(n => n.temaId === temaActivoId);
    const textosExistentes = citasActuales.map(c => `- ${c.fuente}`).join('\n');
    const reglaNoRepetir = citasActuales.length > 0 ? `\n\nREGLA: El usuario YA TIENE citas de estas fuentes. PROHIBIDO repetir:\n${textosExistentes}\nBusca citas totalmente NUEVAS.` : '';
    let peticionFiltro = fuenteFiltro.trim() !== '' ? `\n\nFILTRO ESTRICTO: Extrae citas EXCLUSIVAMENTE de este libro, manual o enlace: "${fuenteFiltro}". Si es una URL, lee su contenido obligatoriamente.` : '';

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: `Tema doctrinal: ${temaActivo.nombre}. Busca en la web discursosud.com y sitios oficiales SUD para proveer 3 NUEVAS citas. ${peticionFiltro} ${reglaNoRepetir}` }] }],
        systemInstruction: { parts: [{ text: `Eres un asistente académico para un miembro de La Iglesia de Jesucristo de los Santos de los Últimos Días. SOLO usa fuentes oficiales SUD. Devuelve JSON con array "resultados": [{ "contenido": "texto", "fuente": "referencia", "tipo": "escritura" | "citaProfetica" }]` }] },
        tools: [{ "google_search": {} }],
        generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { resultados: { type: "ARRAY", items: { type: "OBJECT", properties: { contenido: { type: "STRING" }, fuente: { type: "STRING" }, tipo: { type: "STRING" } }, required: ["contenido", "fuente", "tipo"] } } }, required: ["resultados"] } }
      };

      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      const textoJSON = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (textoJSON) {
        const respuestaParseada = JSON.parse(textoJSON);
        const notasRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notas');
        for (const cita of respuestaParseada.resultados) {
          await addDoc(notasRef, { temaId: temaActivoId, contenido: cita.contenido, fuente: cita.fuente, tipo: cita.tipo, timestamp: Date.now() });
        }
        showToast('Nuevas citas doctrinales agregadas.');
      }
    } catch (error) { showToast('Ocurrió un error al consultar la biblioteca oficial.'); } 
    finally { setIsSearching(false); }
  };

  // --- 5. LÓGICA DE ESTUDIO PROFUNDO (NUEVA FUNCIÓN) ---
  const generarEstudioProfundo = async (e) => {
    e.preventDefault();
    if (!user || !nuevoTemaEstudio.trim() || isGeneratingStudy) return;
    setIsGeneratingStudy(true);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: `Realiza un análisis doctrinal exhaustivo y profundo sobre el tema: "${nuevoTemaEstudio}".` }] }],
        systemInstruction: {
          parts: [{
            text: `Eres un erudito de las escrituras y académico de La Iglesia de Jesucristo de los Santos de los Últimos Días.
            Tu objetivo es proveer un estudio personal profundo, edificante y doctrinalmente preciso.
            
            REGLAS:
            1. Usa SOLO doctrina y principios aprobados por la Iglesia de Jesucristo de los Santos de los Últimos Días.
            2. Si es aplicable, explica breve y concisamente el significado de las palabras clave en su idioma original (Hebreo o Griego Bíblico) para dar mayor profundidad al entendimiento.
            3. Escribe en un tono natural, espiritual y profundo.
            
            ESTRUCTURA DE RESPUESTA (JSON STRICTO):
            {
              "titulo": "Título del tema analizado",
              "etimologia_contexto": "Breve explicación de las raíces de las palabras en Hebreo/Griego y su contexto histórico en las escrituras.",
              "analisis_doctrinal": "Explicación profunda, pura y concisa de la doctrina detrás de este tema.",
              "citas_apoyo": [
                { "texto": "Cita literal", "fuente": "Referencia exacta (ej. Alma 32 o Pdte. Nelson)" }
              ]
            }`
          }]
        },
        tools: [{ "google_search": {} }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              titulo: { type: "STRING" },
              etimologia_contexto: { type: "STRING" },
              analisis_doctrinal: { type: "STRING" },
              citas_apoyo: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: { texto: { type: "STRING" }, fuente: { type: "STRING" } },
                  required: ["texto", "fuente"]
                }
              }
            },
            required: ["titulo", "etimologia_contexto", "analisis_doctrinal", "citas_apoyo"]
          }
        }
      };

      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      const textoJSON = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (textoJSON) {
        const estudioGenerado = JSON.parse(textoJSON);
        const estudiosRef = collection(db, 'artifacts', appId, 'users', user.uid, 'estudios');
        const docRef = await addDoc(estudiosRef, {
          ...estudioGenerado,
          tema_original: nuevoTemaEstudio,
          timestamp: Date.now()
        });
        
        setNuevoTemaEstudio('');
        setEstudioActivoId(docRef.id);
        showToast('Estudio profundo generado con éxito.');
      }
    } catch (error) {
      console.error("Error Estudio:", error);
      showToast('Error al generar el estudio profundo.');
    } finally {
      setIsGeneratingStudy(false);
    }
  };

  const eliminarEstudio = async (id, e) => {
    e.stopPropagation();
    if (!user || !window.confirm("¿Eliminar este estudio profundo permanentemente?")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'estudios', id));
    if (estudioActivoId === id) setEstudioActivoId(estudios.filter(t => t.id !== id)[0]?.id || null);
    showToast('Estudio eliminado.');
  };


  // --- RENDER DE VISTAS ---
  
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <BookOpen size={48} className="text-[#2C3E50] mb-4" />
          <p className="text-lg text-gray-600 font-medium">Conectando a LiahonaAI...</p>
        </div>
      </div>
    );
  }

  // VISTA: LOGIN / REGISTRO
  if (authView === 'login' || authView === 'register') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-[#2C3E50] p-6 text-center">
            <BookOpen size={40} className="text-amber-400 mx-auto mb-2" />
            <h1 className="text-2xl font-bold text-white">Liahona<span className="font-light">AI</span></h1>
            <p className="text-slate-300 text-sm mt-1">Tu Biblioteca Doctrinal Personal</p>
          </div>
          
          <div className="p-8">
            {authError && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 text-center">{authError}</div>}
            {authView === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label><input type="email" required value={loginData.email} onChange={e => setLoginData({...loginData, email: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#2C3E50] bg-gray-50" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label><input type="password" required value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#2C3E50] bg-gray-50" /></div>
                <button type="submit" disabled={authLoading} className="w-full bg-[#2C3E50] text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 mt-4">Ingresar a mi cuenta</button>
                <p className="text-center text-sm text-gray-600 mt-4">¿No tienes cuenta? <button type="button" onClick={() => {setAuthView('register'); setAuthError('');}} className="text-amber-600 font-bold hover:underline">Regístrate aquí</button></p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label><input type="text" required value={regData.nombre} onChange={e => setRegData({...regData, nombre: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-gray-50" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">País</label><input type="text" required value={regData.pais} onChange={e => setRegData({...regData, pais: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-gray-50" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label><input type="tel" required value={regData.whatsapp} onChange={e => setRegData({...regData, whatsapp: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-gray-50" /></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label><input type="email" required value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-gray-50" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label><input type="password" required value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} className="w-full px-3 py-2 border rounded-lg bg-gray-50" minLength="6" /></div>
                <button type="submit" disabled={authLoading} className="w-full bg-amber-500 text-white py-3 rounded-lg font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 mt-2">Crear Cuenta Segura</button>
                <p className="text-center text-sm text-gray-600 mt-2">¿Ya tienes cuenta? <button type="button" onClick={() => {setAuthView('login'); setAuthError('');}} className="text-[#2C3E50] font-bold hover:underline">Inicia sesión</button></p>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VISTA: PANEL DE ADMINISTRADOR
  if (authView === 'admin' && userProfile?.role === 'admin') {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div><h1 className="text-2xl font-bold text-[#2C3E50] flex items-center gap-2"><ShieldAlert className="text-red-500"/> Panel de Administración General</h1></div>
            <div className="flex gap-4"><button onClick={() => setAuthView('app')} className="px-5 py-2.5 bg-blue-100 text-blue-700 rounded-lg font-bold hover:bg-blue-200">Volver a la App</button></div>
          </div>
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
            <div className="p-5 border-b bg-gray-50 flex justify-between items-center"><h2 className="font-bold text-gray-700">Directorio Global ({allUsers.length})</h2><button onClick={loadAdminData} className="text-blue-600 font-bold hover:underline">Actualizar Lista</button></div>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600"><tr><th className="p-4">Nombre</th><th className="p-4">Correo</th><th className="p-4">País/WA</th><th className="p-4">Rol</th></tr></thead>
              <tbody>
                {allUsers.map(u => (
                  <tr key={u.uid} className="border-b hover:bg-blue-50">
                    <td className="p-4 font-bold">{u.nombre}</td><td className="p-4">{u.email}</td><td className="p-4">{u.pais} - {u.whatsapp}</td>
                    <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${u.role === 'admin'?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}`}>{u.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // VISTA: APP PRINCIPAL (Tableros y Estudios)
  const getEstilosPostIt = (tipo) => {
    switch (tipo) {
      case 'escritura': return { bg: 'bg-blue-50', border: 'border-blue-500', iconColor: 'text-blue-500', Icon: BookOpen, tag: '📖 Escritura' };
      case 'citaProfetica': return { bg: 'bg-amber-50', border: 'border-amber-500', iconColor: 'text-amber-600', Icon: Mic, tag: '🗣️ Enseñanza' };
      default: return { bg: 'bg-white', border: 'border-slate-400', iconColor: 'text-slate-500', Icon: Edit3, tag: '📝 Impresión' };
    }
  };

  const notasDelTemaActivo = notas.filter(n => n.temaId === temaActivoId);
  const temaActivoObj = temas.find(t => t.id === temaActivoId);
  const estudioActivoObj = estudios.find(e => e.id === estudioActivoId);

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-[#2C3E50] overflow-hidden relative">
      {toastMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
          <Sparkles size={18} className="text-amber-400"/> {toastMsg}
        </div>
      )}

      {/* BARRA LATERAL (Navegación Unificada) */}
      <div className={`${showSidebar ? 'w-72 translate-x-0' : 'w-0 -translate-x-full'} transition-all duration-300 bg-slate-900 text-white flex flex-col shadow-2xl z-40 absolute md:relative h-full shrink-0`}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center whitespace-nowrap">
          <h1 className="text-xl font-bold text-amber-400 tracking-wide flex items-center gap-2">
            <BookOpen size={24} /> Liahona<span className="font-light text-white">AI</span>
          </h1>
          <button onClick={() => setShowSidebar(false)} className="md:hidden text-gray-400 hover:text-white"><X size={24} /></button>
        </div>
        
        {/* Pestañas de Modo */}
        <div className="flex p-2 bg-slate-950/50">
          <button onClick={() => setAppMode('tableros')} className={`flex-1 flex justify-center items-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${appMode === 'tableros' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
            <BookMarked size={16}/> Tableros
          </button>
          <button onClick={() => setAppMode('estudio')} className={`flex-1 flex justify-center items-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${appMode === 'estudio' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
            <GraduationCap size={16}/> Exégesis
          </button>
        </div>

        <div className="p-4 flex-grow overflow-y-auto">
          {appMode === 'tableros' ? (
            <>
              <div className="text-xs uppercase text-slate-400 font-semibold mb-3 tracking-wider px-2">Mis Archivos Recopilados</div>
              <ul className="space-y-1 mb-6">
                {temas.map(tema => (
                  <li key={tema.id} onClick={() => { setTemaActivoId(tema.id); setShowSidebar(window.innerWidth > 768); }} className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${temaActivoId === tema.id ? 'bg-slate-800 border-l-4 border-amber-400 text-white' : 'hover:bg-slate-800 text-slate-300 border-l-4 border-transparent'}`}>
                    <div className="flex items-center gap-3 overflow-hidden"><Folder size={18} className={temaActivoId === tema.id ? 'text-amber-400' : 'text-slate-500'} /><span className="truncate text-sm font-medium">{tema.nombre}</span></div>
                    <button onClick={(e) => eliminarTema(tema.id, e)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"><Trash2 size={16} /></button>
                  </li>
                ))}
              </ul>
              <form onSubmit={crearTema} className="mt-4 border-t border-slate-700 pt-4">
                <div className="relative">
                  <input type="text" value={nuevoTemaNombre} onChange={(e) => setNuevoTemaNombre(e.target.value)} placeholder="Nuevo tablero doctrinal..." className="w-full bg-slate-800 text-white text-sm border border-slate-700 rounded-lg pl-3 pr-10 py-2 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 placeholder-slate-500" />
                  <button type="submit" disabled={!nuevoTemaNombre.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 hover:text-amber-300 disabled:opacity-50"><Plus size={18} /></button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="text-xs uppercase text-slate-400 font-semibold mb-3 tracking-wider px-2">Análisis Profundos</div>
              <ul className="space-y-1 mb-6">
                {estudios.map(estudio => (
                  <li key={estudio.id} onClick={() => { setEstudioActivoId(estudio.id); setShowSidebar(window.innerWidth > 768); }} className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${estudioActivoId === estudio.id ? 'bg-slate-800 border-l-4 border-blue-400 text-white' : 'hover:bg-slate-800 text-slate-300 border-l-4 border-transparent'}`}>
                    <div className="flex items-center gap-3 overflow-hidden"><GraduationCap size={18} className={estudioActivoId === estudio.id ? 'text-blue-400' : 'text-slate-500'} /><span className="truncate text-sm font-medium">{estudio.tema_original}</span></div>
                    <button onClick={(e) => eliminarEstudio(estudio.id, e)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"><Trash2 size={16} /></button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Perfil Sidebar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-amber-400 font-bold shrink-0"><User size={16}/></div>
              <div className="truncate"><p className="text-sm font-medium text-white truncate">{userProfile?.nombre}</p></div>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 p-1" title="Cerrar Sesión"><LogOut size={16}/></button>
          </div>
        </div>
      </div>

      {/* ÁREA PRINCIPAL DE TRABAJO */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="bg-white shadow-sm p-4 px-6 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"><Menu size={24} /></button>
            {appMode === 'tableros' ? (
              temaActivoObj ? (
                <div><h2 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2"><Folder className="text-amber-500 hidden sm:block" size={24} /> {temaActivoObj.nombre}</h2><p className="text-xs sm:text-sm text-gray-500">{notasDelTemaActivo.length} notas recopiladas</p></div>
              ) : <h2 className="text-xl font-bold text-gray-400">Selecciona o crea un archivo</h2>
            ) : (
              <div><h2 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2"><GraduationCap className="text-blue-500 hidden sm:block" size={24} /> Portal de Exégesis</h2><p className="text-xs sm:text-sm text-gray-500">Análisis profundo de doctrina</p></div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
          {appMode === 'tableros' ? (
            // --- VISTA TABLEROS (RECOPILACIÓN) ---
            temaActivoObj ? (
              <div className="max-w-7xl mx-auto">
                <div className="mb-8 bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                  <form onSubmit={agregarNotaManual}>
                    <textarea value={nuevaNotaTexto} onChange={(e) => setNuevaNotaTexto(e.target.value)} placeholder="Escribe una impresión del Espíritu..." className="w-full h-20 p-3 border border-gray-100 bg-gray-50 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-slate-200 text-gray-700 placeholder-gray-400 mb-3" />
                    <div className="mb-4 bg-blue-50/50 p-2 rounded-lg border border-blue-100 flex items-center gap-2"><LinkIcon size={16} className="text-blue-400 shrink-0" /><input type="text" value={fuenteFiltro} onChange={(e) => setFuenteFiltro(e.target.value)} placeholder="Opcional: Filtrar por libro (ej. Predicad Mi Evangelio)..." className="w-full bg-transparent border-none text-sm focus:ring-0 p-1 text-gray-700 placeholder-blue-300" /></div>
                    <div className="flex flex-col sm:flex-row justify-between pt-3 border-t border-gray-100 gap-3">
                      <button type="submit" disabled={!nuevaNotaTexto.trim()} className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2"><Edit3 size={16} /> Añadir Impresión</button>
                      <button type="button" onClick={pedirSugerenciasIA} disabled={isSearching} className={`w-full sm:w-auto px-5 py-2.5 text-sm font-bold rounded-lg flex items-center justify-center gap-2 shadow-sm ${isSearching ? 'bg-amber-100 text-amber-600 cursor-wait' : 'bg-amber-400 text-amber-900 hover:bg-amber-500'}`}>{isSearching ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></span> : <Wand2 size={18}/>} Extraer citas IA</button>
                    </div>
                  </form>
                </div>
                <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6 pb-20">
                  {notasDelTemaActivo.map((nota) => {
                    const estilos = getEstilosPostIt(nota.tipo);
                    return (
                      <div key={nota.id} className={`break-inside-avoid relative rounded-xl shadow-md border-l-[6px] p-5 hover:-translate-y-1 transition-transform group ${estilos.bg} ${estilos.border}`}>
                        <div className="absolute top-0 right-0 bg-white/80 text-[10px] font-bold uppercase px-2 py-1 rounded-bl-lg rounded-tr-xl text-gray-500">{estilos.tag}</div>
                        <button onClick={() => eliminarNota(nota.id)} className="absolute top-6 right-3 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 bg-white/80 rounded-full p-1.5"><Trash2 size={14} /></button>
                        <p className="text-gray-800 leading-relaxed text-[14px] whitespace-pre-wrap mt-4">"{nota.contenido}"</p>
                        <div className="text-xs font-bold text-gray-600 border-t border-black/5 pt-3 mt-4 text-right flex justify-end items-start gap-1"><ChevronRight size={12} className="text-gray-400 shrink-0 mt-0.5"/> {nota.fuente}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (<div className="flex flex-col items-center justify-center h-full text-center px-4"><Folder size={64} className="text-slate-300 mb-4" /><h3 className="text-2xl font-bold text-slate-700">Selecciona un Tablero</h3></div>)
          ) : (
            // --- VISTA ESTUDIO PROFUNDO ---
            <div className="max-w-4xl mx-auto pb-20">
              <div className="mb-8 bg-white p-5 rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                <h3 className="font-bold text-lg text-blue-900 mb-3 flex items-center gap-2"><Sparkles className="text-blue-500" size={20}/> Solicitar Análisis Erudito</h3>
                <form onSubmit={generarEstudioProfundo} className="flex flex-col sm:flex-row gap-3">
                  <input type="text" value={nuevoTemaEstudio} onChange={(e) => setNuevoTemaEstudio(e.target.value)} placeholder="Ej: La Caridad (Moroni 7), El significado de la Expiación, La vara de hierro..." className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
                  <button type="submit" disabled={!nuevoTemaEstudio.trim() || isGeneratingStudy} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                    {isGeneratingStudy ? <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span> Escudriñando...</> : 'Generar Estudio'}
                  </button>
                </form>
              </div>

              {estudioActivoObj ? (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                  <div className="bg-slate-900 p-8 text-center border-b-4 border-amber-500">
                    <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{estudioActivoObj.titulo}</h1>
                    <p className="text-slate-400 font-medium tracking-wide uppercase text-sm">Análisis Doctrinal Profundo</p>
                  </div>
                  
                  <div className="p-6 sm:p-10 space-y-10">
                    {/* Etimología Box */}
                    {estudioActivoObj.etimologia_contexto && (
                      <div className="bg-amber-50 rounded-xl p-6 border border-amber-200 relative">
                        <div className="absolute -top-4 left-6 bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider flex items-center gap-1 uppercase shadow-sm">
                          <BookOpen size={12}/> Raíces y Contexto Histórico
                        </div>
                        <p className="text-amber-900 leading-relaxed font-serif text-[15px] pt-2">{estudioActivoObj.etimologia_contexto}</p>
                      </div>
                    )}

                    {/* Exégesis Principal */}
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 border-b-2 border-blue-100 pb-3 mb-4 flex items-center gap-2">
                        <GraduationCap className="text-blue-600"/> La Doctrina Pura
                      </h3>
                      <p className="text-gray-700 leading-loose text-lg whitespace-pre-line font-serif">
                        {estudioActivoObj.analisis_doctrinal}
                      </p>
                    </div>

                    {/* Citas de Apoyo */}
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 border-b-2 border-blue-100 pb-3 mb-6 flex items-center gap-2">
                        <Mic className="text-blue-600"/> Apoyo Profético y Escritural
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {estudioActivoObj.citas_apoyo?.map((cita, index) => (
                          <div key={index} className="bg-slate-50 p-5 rounded-xl border border-slate-200 hover:shadow-md transition-shadow">
                            <p className="text-gray-800 italic text-[15px] leading-relaxed">"{cita.texto}"</p>
                            <div className="mt-3 pt-3 border-t border-slate-200 text-right text-sm font-bold text-blue-800">
                              — {cita.fuente}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-gray-500">Escribe un tema doctrinal arriba para generar un estudio profundo.</div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}