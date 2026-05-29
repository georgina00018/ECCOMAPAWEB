// script.js - Integración con Firebase
// Este archivo se carga como módulo desde index.html.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDV-D50gD-tuIBbIFhY4RYfILZX8V6Dbc",
  authDomain: "ecomapa-36705.firebaseapp.com",
  projectId: "ecomapa-36705",
  storageBucket: "ecomapa-36705.appspot.com",
  messagingSenderId: "700543154907",
  appId: "1:700543154907:web:e2556cf326b54b8c226afe",
  measurementId: "G-CXLYYRSYL3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PIN_JEFE = '1234';
let usuarioActual = null;
let estadoSeleccionado = null;
let fotoBase64 = null;
let filtroJefeActivo = 'todos';

window.ir = function(pantalla) {
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  const el = document.getElementById(pantalla);
  if (el) el.classList.add('activa');

  if (pantalla === 'p-app') {
    cambiarTab('mapa');
    cargarMapa();
    cargarHistorial();
  }
  if (pantalla === 'p-jefe') {
    cargarRegistrosJefe();
  }
};

window.cambiarTab = function(tab) {
  document.querySelectorAll('.tab-contenido').forEach(t => t.classList.remove('activo'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('activo'));
  const contenido = document.getElementById('tab-' + tab);
  const nav = document.getElementById('nav-' + tab);
  if (contenido) contenido.classList.add('activo');
  if (nav) nav.classList.add('activo');
};

window.mostrarToast = function(msg, tipo = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast visible ' + tipo;
  setTimeout(() => t.className = 'toast', 2800);
};

function mostrarLoading() { document.getElementById('loading')?.classList.add('visible'); }
function ocultarLoading() { document.getElementById('loading')?.classList.remove('visible'); }

function _mostrarError(selector, mensaje) {
  const el = document.getElementById(selector);
  if (!el) return;
  el.textContent = mensaje;
  el.classList.add('visible');
}

function _ocultarError(selector) {
  const el = document.getElementById(selector);
  if (!el) return;
  el.classList.remove('visible');
}

async function cargarPerfilUsuario(uid) {
  const perfilRef = doc(db, 'usuarios', uid);
  const perfilSnap = await getDoc(perfilRef);
  return perfilSnap.exists() ? perfilSnap.data() : null;
}

function _formatoFecha(valor) {
  if (!valor) return '';
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

async function _obtenerUsuarioActual() {
  if (usuarioActual && usuarioActual.uid) return usuarioActual;
  const user = auth.currentUser;
  if (!user) return null;
  const perfil = await cargarPerfilUsuario(user.uid);
  usuarioActual = perfil ? { uid: user.uid, ...perfil } : { uid: user.uid, email: user.email, nombre: user.email, zona: '—', rol: 'empleado' };
  return usuarioActual;
}

async function _obtenerRegistrosTodos() {
  const registrosQuery = query(collection(db, 'registros'), orderBy('creadoEn', 'desc'));
  const snapshot = await getDocs(registrosQuery);
  return snapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));
}

async function _obtenerRegistrosPorUsuario(uid) {
  const registrosQuery = query(
    collection(db, 'registros'),
    where('creadoPor', '==', uid),
    orderBy('creadoEn', 'desc')
  );
  const snapshot = await getDocs(registrosQuery);
  return snapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));
}

window.registrar = async function() {
  const nombre = document.getElementById('reg-nombre').value.trim();
  const dni = document.getElementById('reg-dni').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  const zona = document.getElementById('reg-zona').value;

  _ocultarError('reg-error');

  if (!nombre || !dni || !email || !pass || !zona) {
    _mostrarError('reg-error', 'Completá todos los campos.');
    return;
  }
  if (pass !== pass2) {
    _mostrarError('reg-error', 'Las contraseñas no coinciden.');
    return;
  }
  if (pass.length < 6) {
    _mostrarError('reg-error', 'La contraseña debe tener al menos 6 caracteres.');
    return;
  }

  mostrarLoading();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'usuarios', cred.user.uid), {
      nombre,
      dni,
      email,
      zona,
      rol: 'empleado',
      creadoEn: serverTimestamp()
    });
    mostrarToast('✅ Cuenta creada exitosamente', 'exito');
    ir('p-login');
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      _mostrarError('reg-error', 'El correo ya está registrado.');
    } else if (error.code === 'auth/invalid-email') {
      _mostrarError('reg-error', 'El correo no es válido.');
    } else {
      _mostrarError('reg-error', 'Error al crear cuenta. Intentá de nuevo.');
    }
  } finally {
    ocultarLoading();
  }
};

window.login = async function() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;

  _ocultarError('login-error');

  if (!email || !pass) {
    _mostrarError('login-error', 'Ingresá tu correo y contraseña.');
    return;
  }

  mostrarLoading();
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const perfil = await cargarPerfilUsuario(cred.user.uid);
    usuarioActual = perfil ? { uid: cred.user.uid, ...perfil } : { uid: cred.user.uid, email, nombre: email, zona: '—', rol: 'empleado' };
    onLoginSuccess();
  } catch (error) {
    if (error.code === 'auth/wrong-password') {
      _mostrarError('login-error', 'Contraseña incorrecta.');
    } else if (error.code === 'auth/user-not-found') {
      _mostrarError('login-error', 'No existe una cuenta con ese correo.');
    } else if (error.code === 'auth/invalid-email') {
      _mostrarError('login-error', 'El correo no es válido.');
    } else {
      _mostrarError('login-error', 'Error al iniciar sesión. Revisá tus datos.');
    }
  } finally {
    ocultarLoading();
  }
};

window.cerrarSesion = async function() {
  mostrarLoading();
  try {
    await signOut(auth);
    usuarioActual = null;
    ir('p-bienvenida');
  } catch (error) {
    mostrarToast('Error al cerrar sesión.', 'error');
  } finally {
    ocultarLoading();
  }
};

window.pedirPinJefe = function() {
  document.getElementById('jefe-pin-overlay').style.display = 'flex';
  document.getElementById('pin-error').style.display = 'none';
  setTimeout(() => document.getElementById('pin-input').focus(), 200);
};
window.cerrarPin = function() { document.getElementById('jefe-pin-overlay').style.display = 'none'; };
window.verificarPin = function() {
  const v = document.getElementById('pin-input').value.trim();
  const err = document.getElementById('pin-error');
  if (v === PIN_JEFE) {
    err.style.display = 'none';
    document.getElementById('pin-input').value = '';
    cerrarPin();
    ir('p-jefe');
  } else {
    err.style.display = 'block';
  }
};

window.seleccionarEstado = function(estado, btn) {
  estadoSeleccionado = estado;
  document.querySelectorAll('.estado-btn').forEach(b => b.classList.remove('seleccionado'));
  if (btn) btn.classList.add('seleccionado');
};

window.previsualizarFoto = function(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    fotoBase64 = e.target.result;
    document.getElementById('foto-preview').src = fotoBase64;
    document.getElementById('foto-label').style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window.guardarContenedor = async function() {
  const id = document.getElementById('reg-contenedor-id').value.trim();
  const zona = document.getElementById('reg-zona-contenedor').value;
  const obs = document.getElementById('reg-observaciones').value.trim();

  _ocultarError('reg-cont-error');

  if (!id || !estadoSeleccionado || !zona) {
    _mostrarError('reg-cont-error', 'Completá ID, estado y zona.');
    return;
  }

  const usuario = await _obtenerUsuarioActual();
  if (!usuario) {
    mostrarToast('Debés iniciar sesión para guardar registros.', 'error');
    return;
  }

  mostrarLoading();
  try {
    await addDoc(collection(db, 'registros'), {
      contenedor: id,
      estado: estadoSeleccionado,
      zona,
      observaciones: obs,
      foto: fotoBase64 || null,
      creadoPor: usuario.uid,
      creadoPorNombre: usuario.nombre,
      creadoEn: serverTimestamp()
    });
    mostrarToast('Registro guardado ✔️', 'exito');
    document.getElementById('reg-contenedor-id').value = '';
    document.getElementById('reg-zona-contenedor').value = '';
    document.getElementById('reg-observaciones').value = '';
    document.getElementById('foto-preview').src = '';
    document.getElementById('foto-label').style.display = 'inline';
    fotoBase64 = null;
    estadoSeleccionado = null;
    document.querySelectorAll('.estado-btn').forEach(b => b.classList.remove('seleccionado'));
    cargarHistorial();
    cargarRegistrosJefe();
  } catch (error) {
    console.error('guardarContenedor error:', error);
    _mostrarError('reg-cont-error', error.message || 'No se pudo guardar el registro. Intentá de nuevo.');
  } finally {
    ocultarLoading();
  }
};

window.cargarHistorial = async function() {
  const lista = document.getElementById('historial-lista');
  if (!lista) return;
  if (!usuarioActual) {
    lista.innerHTML = `<div class="sin-registros"><p>Iniciá sesión para ver tu historial.</p></div>`;
    return;
  }

  mostrarLoading();
  try {
    const items = await _obtenerRegistrosPorUsuario(usuarioActual.uid);
    if (!items.length) {
      lista.innerHTML = `<div class="sin-registros"><p>Sin registros todavía.</p></div>`;
      return;
    }
    lista.innerHTML = items.map(r => `
      <div class="historial-item">
        <div class="historial-meta">
          <strong>${r.contenedor}</strong>
          <span class="historial-estado">${r.estado}</span>
        </div>
        <div class="historial-sub">${r.zona} · ${_formatoFecha(r.creadoEn)}</div>
        <div class="historial-obs">${r.observaciones || ''}</div>
      </div>
    `).join('');
  } finally {
    ocultarLoading();
  }
};

window.cargarRegistrosJefe = async function() {
  const cont = document.getElementById('jefe-registros-lista');
  if (!cont) return;

  mostrarLoading();
  try {
    const items = await _obtenerRegistrosTodos();
    const filtrados = filtroJefeActivo === 'todos' ? items : items.filter(r => r.estado === filtroJefeActivo);
    cont.innerHTML = filtrados.map(r => `
      <div class="jefe-registro">
        <div><strong>${r.contenedor}</strong> — ${r.zona}</div>
        <div>${r.estado} · ${_formatoFecha(r.creadoEn)}</div>
        <div>${r.creadoPorNombre || ''}</div>
      </div>
    `).join('') || '<div class="sin-registros"><p>Sin registros.</p></div>';

    document.getElementById('stat-limpios').textContent = items.filter(r => r.estado === 'limpio').length;
    document.getElementById('stat-sucios').textContent = items.filter(r => r.estado === 'sucio').length;
    document.getElementById('stat-rotos').textContent = items.filter(r => r.estado === 'roto').length;
  } finally {
    ocultarLoading();
  }
};

window.filtrarJefe = function(filtro, btn) {
  filtroJefeActivo = filtro;
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
  if (btn) btn.classList.add('activo');
  cargarRegistrosJefe();
};

window.exportarCSV = async function() {
  mostrarLoading();
  try {
    const items = await _obtenerRegistrosTodos();
    if (!items.length) {
      mostrarToast('No hay registros para exportar');
      return;
    }
    const headers = ['contenedor', 'estado', 'zona', 'observaciones', 'creadoPorNombre', 'creadoEn'];
    const csv = [headers.join(',')].concat(items.map(r =>
      [r.contenedor, r.estado, r.zona, (r.observaciones || '').replace(/\n/g, ' '), (r.creadoPorNombre || ''), _formatoFecha(r.creadoEn)]
        .map(v => `"${('' + v).replace(/"/g, '""')}"`).join(',')
    )).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registros.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    ocultarLoading();
  }
};

window.cargarMapa = async function() {
  const lista = document.getElementById('lista-mapa');
  if (!lista) return;
  mostrarLoading();
  try {
    const items = await _obtenerRegistrosTodos();
    const recientes = items.slice(0, 8);
    lista.innerHTML = recientes.map(r => `
      <div class="lista-item">
        <strong>${r.contenedor}</strong>
        <div class="muted">${r.zona} · ${r.estado}</div>
      </div>
    `).join('') || '<div class="sin-registros"><p>No hay contenedores recientes.</p></div>';
  } finally {
    ocultarLoading();
  }
};

function onLoginSuccess() {
  document.getElementById('app-nombre-usuario').textContent = usuarioActual.nombre || '—';
  document.getElementById('app-zona-usuario').textContent = 'Zona: ' + (usuarioActual.zona || '—');
  ir('p-app');
}

onAuthStateChanged(auth, async user => {
  if (user) {
    try {
      const perfil = await cargarPerfilUsuario(user.uid);
      usuarioActual = perfil ? { uid: user.uid, ...perfil } : { uid: user.uid, email: user.email, nombre: user.email, zona: '—', rol: 'empleado' };
      onLoginSuccess();
    } catch (error) {
      console.error('Error cargando perfil:', error);
      usuarioActual = { uid: user.uid, email: user.email, nombre: user.email, zona: '—', rol: 'empleado' };
      onLoginSuccess();
    }
  } else {
    usuarioActual = null;
    if (document.getElementById('p-app')?.classList.contains('activa')) {
      ir('p-login');
    }
  }
});

