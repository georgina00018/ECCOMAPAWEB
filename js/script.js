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
// Map state (Leaflet)
let mapaInicializado = false;
let mapa = null;
let markersGroup = null;

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
  // Sin orderBy para evitar requerir índice compuesto en Firebase
  const registrosQuery = query(
    collection(db, 'registros'),
    where('creadoPor', '==', uid)
  );
  const snapshot = await getDocs(registrosQuery);
  const items = snapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));
  // Ordenar en cliente (más recientes primero)
  return items.sort((a, b) => {
    const timeA = a.creadoEn?.toMillis?.() || 0;
    const timeB = b.creadoEn?.toMillis?.() || 0;
    return timeB - timeA;
  });
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

window.obtenerUbicacion = function() {
  const estadoEl = document.getElementById('ubicacion-estado');
  if (!('geolocation' in navigator)) {
    if (estadoEl) estadoEl.textContent = 'Geolocalización no soportada en este dispositivo.';
    mostrarToast('Geolocalización no soportada.', 'error');
    console.warn('Geolocalización no soportada');
    return;
  }

  if (estadoEl) estadoEl.textContent = 'Obteniendo ubicación (permitir acceso si pide permiso)...';
  console.log('Iniciando geolocalización...');
  const opciones = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    console.log(`✓ Ubicación obtenida: Lat ${lat}, Lon ${lon}, Precisión: ±${accuracy.toFixed(0)}m`);
    const latEl = document.getElementById('reg-latitud');
    const lonEl = document.getElementById('reg-longitud');
    if (latEl) latEl.value = lat.toFixed(6);
    if (lonEl) lonEl.value = lon.toFixed(6);
    if (estadoEl) estadoEl.textContent = `✓ Ubicación real: ${lat.toFixed(6)}, ${lon.toFixed(6)} (±${accuracy.toFixed(0)}m)`;
    mostrarToast('Ubicación actual registrada', 'exito');
  }, err => {
    console.error('geolocation error code:', err.code, 'mensaje:', err.message);
    if (estadoEl) {
      if (err.code === 1) estadoEl.textContent = '❌ Permiso denegado. Habilitá ubicación en ajustes del navegador.';
      else if (err.code === 2) estadoEl.textContent = '❌ No se pudo obtener la ubicación (no hay señal GPS).';
      else if (err.code === 3) estadoEl.textContent = '❌ Timeout al obtener ubicación (tardó demasiado).';
      else estadoEl.textContent = '❌ Error desconocido: ' + err.message;
    }
    mostrarToast('No se pudo obtener la ubicación.', 'error');
  }, opciones);
};

window.guardarContenedor = async function() {
  const id = document.getElementById('reg-contenedor-id').value.trim();
  const zona = document.getElementById('reg-zona-contenedor').value;
  const obs = document.getElementById('reg-observaciones').value.trim();
  const latVal = document.getElementById('reg-latitud')?.value.trim();
  const lonVal = document.getElementById('reg-longitud')?.value.trim();

  _ocultarError('reg-cont-error');

  if (!id || !estadoSeleccionado || !zona) {
    _mostrarError('reg-cont-error', 'Completá ID, estado y zona.');
    return;
  }

  // Validar ubicación: exigir latitud y longitud
  if (!latVal || !lonVal) {
    _mostrarError('reg-cont-error', 'Obtené la ubicación actual antes de guardar (botón 📍).');
    return;
  }

  const lat = parseFloat(latVal.replace(',', '.'));
  const lon = parseFloat(lonVal.replace(',', '.'));
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    _mostrarError('reg-cont-error', 'Latitud o longitud inválida. Verificá los valores.');
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
      lat: lat,
      lon: lon,
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
    // Manejo específico para permisos insuficientes en Firestore
    if (error && (error.code === 'permission-denied' || (error.message && error.message.toLowerCase().includes('permission')))) {
      _mostrarError('reg-cont-error', 'Permisos insuficientes en Firestore. Revisá las reglas de seguridad (permission-denied).');
      mostrarToast('Permisos insuficientes para guardar.', 'error');
    } else {
      _mostrarError('reg-cont-error', error.message || 'No se pudo guardar el registro. Intentá de nuevo.');
    }
  } finally {
    ocultarLoading();
  }
};

window.cargarHistorial = async function() {
  const lista = document.getElementById('historial-lista');
  if (!lista) return;
  if (!usuarioActual) {
    console.warn('usuarioActual no existe');
    lista.innerHTML = `<div class="sin-registros"><p>Iniciá sesión para ver tu historial.</p></div>`;
    return;
  }

  console.log('Cargando historial del usuario:', usuarioActual.uid, usuarioActual.nombre);
  mostrarLoading();
  try {
    const items = await _obtenerRegistrosPorUsuario(usuarioActual.uid);
    console.log('Registros obtenidos:', items.length);
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
  } catch (error) {
    console.error('Error cargando historial:', error);
    lista.innerHTML = `<div class="sin-registros"><p>Error al cargar historial: ${error.message}</p></div>`;
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
  const mapaDiv = document.getElementById('mapa');
  if (!lista || !mapaDiv) return;
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

    // Inicializar mapa si hace falta
    if (!mapaInicializado && typeof L !== 'undefined') {
      console.log('Inicializando Leaflet mapa...');
      try {
        const mapElement = document.getElementById('mapa');
        if (mapElement) {
          mapa = L.map('mapa', { zoomControl: true }).setView([-34.6037, -58.3816], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(mapa);
          markersGroup = L.layerGroup().addTo(mapa);
          mapaInicializado = true;
          console.log('✓ Leaflet mapa inicializado correctamente');
        } else {
          console.error('Elemento #mapa no encontrado en el DOM');
        }
      } catch (e) {
        console.error('Error inicializando mapa:', e);
      }
    }

    // Limpiar marcadores previos
    if (markersGroup) markersGroup.clearLayers();

    // Añadir marcadores desde registros que tengan lat/lon
    const marcadorCoords = [];
    items.forEach(r => {
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        try {
          const marker = L.marker([lat, lon]);
          const popupHtml = `
            <div style="min-width:150px">
              <strong>${r.contenedor}</strong><br/>
              <small>${r.zona} · ${r.estado}</small><br/>
              ${r.observaciones ? `<div style=\"margin-top:6px;\">${r.observaciones}</div>` : ''}
              ${r.foto ? `<div style=\"margin-top:6px;\"><img src=\"${r.foto}\" style=\"width:120px;border-radius:6px;\"/></div>` : ''}
            </div>
          `;
          marker.bindPopup(popupHtml);
          marker.addTo(markersGroup);
          marcadorCoords.push([lat, lon]);
        } catch (e) {
          console.error('Error creando marcador', e);
        }
      }
    });

    // Ajustar vista del mapa a los marcadores
    if (marcadorCoords.length && mapa) {
      const bounds = L.latLngBounds(marcadorCoords);
      mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }

  } finally {
    ocultarLoading();
  }
};

function onLoginSuccess() {
  document.getElementById('app-nombre-usuario').textContent = usuarioActual.nombre || '—';
  document.getElementById('app-zona-usuario').textContent = 'Zona: ' + (usuarioActual.zona || '—');
  ir('p-app');
}

window.cerrarModal = function() {
  document.getElementById('modal-marcador').style.display = 'none';
};

window.abrirMapaFullscreen = async function() {
  const modal = document.getElementById('modal-mapa-fullscreen');
  if (!modal) return;
  modal.style.display = 'flex';
  setTimeout(async () => {
    if (typeof L !== 'undefined' && !document.getElementById('mapa-fullscreen').dataset.initialized) {
      try {
        const mapFull = L.map('mapa-fullscreen', { zoomControl: true }).setView([-34.6037, -58.3816], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapFull);
        const markerGroupFull = L.layerGroup().addTo(mapFull);
        const items = await _obtenerRegistrosTodos();
        const coords = [];
        items.forEach(r => {
          const lat = parseFloat(r.lat);
          const lon = parseFloat(r.lon);
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            try {
              const marker = L.marker([lat, lon]);
              const popupHtml = `
                <div style="min-width:180px">
                  <strong>${r.contenedor}</strong><br/>
                  <small>${r.zona} · ${r.estado}</small><br/>
                  ${r.observaciones ? `<div style="margin-top:6px;">${r.observaciones}</div>` : ''}
                  ${r.foto ? `<div style="margin-top:6px;"><img src="${r.foto}" style="width:140px;border-radius:6px;"/></div>` : ''}
                </div>
              `;
              marker.bindPopup(popupHtml);
              marker.addTo(markerGroupFull);
              coords.push([lat, lon]);
            } catch (e) {
              console.error('Error en marcador fullscreen:', e);
            }
          }
        });
        if (coords.length) {
          const bounds = L.latLngBounds(coords);
          mapFull.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
        }
        document.getElementById('mapa-fullscreen').dataset.initialized = 'true';
        console.log('✓ Mapa fullscreen inicializado');
      } catch (e) {
        console.error('Error inicializando mapa fullscreen:', e);
      }
    }
  }, 100);
};

window.cerrarMapaFullscreen = function() {
  document.getElementById('modal-mapa-fullscreen').style.display = 'none';
};

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

