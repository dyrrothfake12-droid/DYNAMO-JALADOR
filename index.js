import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDObkCnt1nq0doCVwfiYiMhpfoSc7zhAXo",
    authDomain: "dynamo-jaladores.firebaseapp.com",
    projectId: "dynamo-jaladores",
    storageBucket: "dynamo-jaladores.firebasestorage.app",
    messagingSenderId: "1019895183576",
    appId: "1:1019895183576:web:5acdd3a31e42c5ac53ffad",
    measurementId: "G-51Q9X2TSH7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- CONFIGURACIÓN DE PRECIOS ---
const PRECIOS = { 
    jarra: 3.00,
    botella: 4.00,
    cerveza: 1.00,
    palacete: 8.00,
    botellas100: 5.00,
    bonoMeta: 20.00
}; 

let currentDate = new Date();
let allRecords = []; 
const fechaInput = document.getElementById('fechaInput');
const btnGuardar = document.getElementById('btnGuardar');

fechaInput.valueAsDate = new Date();

// --- INICIO DE APP ---
async function iniciarApp() {
    await limpiezaQuincenalAutomatica(); // Borra datos viejos al entrar
    await cargarDatos();
}
iniciarApp();

// --- FUNCIÓN DE LIMPIEZA QUINCENAL (AUTOMÁTICA) ---
async function limpiezaQuincenalAutomatica() {
    const ultimaLimpieza = localStorage.getItem('ultimaLimpiezaDynamo');
    const hoy = new Date();
    
    // Si no hay fecha o pasaron más de 15 días
    if (!ultimaLimpieza || (hoy - new Date(ultimaLimpieza)) > (15 * 24 * 60 * 60 * 1000)) {
        console.log("Iniciando limpieza de datos antiguos...");
        const hace15Dias = new Date();
        hace15Dias.setDate(hace15Dias.getDate() - 15);
        const fechaLimiteStr = hace15Dias.toISOString().split('T')[0];

        const q = query(collection(db, "registros"), where("fecha", "<", fechaLimiteStr));
        const snapshot = await getDocs(q);
        
        const promesasBorrado = snapshot.docs.map(d => deleteDoc(doc(db, "registros", d.id)));
        await Promise.all(promesasBorrado);
        
        localStorage.setItem('ultimaLimpiezaDynamo', hoy.toISOString());
        console.log("Limpieza completada.");
    }
}

// --- LÓGICA DE BLOQUEO ---
let lockTimer;
window.unlockRegistry = function() {
    const password = prompt("Ingrese contraseña de administrador:");
    if (password === "adminhm") {
        document.getElementById('lockOverlay').style.display = 'none';
        lanzarToast("🔓 Sistema desbloqueado por 15 min");
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = setTimeout(() => {
            document.getElementById('lockOverlay').style.display = 'flex';
            lanzarToast("🔒 Sistema bloqueado");
        }, 900000); 
    } else { alert("Contraseña incorrecta"); }
}

// --- BORRAR REGISTRO MANUAL ---
window.borrarRegistro = async function(id) {
    const password = prompt("Contraseña para BORRAR:");
    if (password !== "adminhm") return alert("Error.");

    if (confirm("¿Eliminar este registro?")) {
        try {
            await deleteDoc(doc(db, "registros", id));
            lanzarToast("🗑️ Registro eliminado");
            await cargarDatos(); 
            document.getElementById('detalleDia').style.display = 'none';
        } catch (e) { lanzarToast("❌ Error"); }
    }
}

// --- PALETA Y NOTAS ---
window.currentColor = null; 
window.paintedDays = JSON.parse(localStorage.getItem('dynamoPaintedDays')) || {}; 
const notasArea = document.getElementById('notasGenerales');
if(localStorage.getItem('dynamoNotas')) notasArea.value = localStorage.getItem('dynamoNotas');
notasArea.addEventListener('input', function() { localStorage.setItem('dynamoNotas', this.value); });

function lanzarToast(mensaje) {
    const x = document.getElementById("toast");
    if(x) {
        x.textContent = mensaje;
        x.className = "show";
        setTimeout(() => { x.className = x.className.replace("show", ""); }, 3000);
    }
}

window.selectColor = function(color) {
    window.currentColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('selected'));
    if(event && event.target) event.target.classList.add('selected');
};

window.paintDay = function(fechaKey) {
    if(window.currentColor === undefined) return; 
    if(window.currentColor === null) { delete window.paintedDays[fechaKey]; } 
    else { window.paintedDays[fechaKey] = window.currentColor; }
    localStorage.setItem('dynamoPaintedDays', JSON.stringify(window.paintedDays));
    renderMiniCalendar(); 
};

// --- CÁLCULOS ---
function calcularGanancia(r) {
    let j = parseInt(r.jarras) || 0;
    let b = parseInt(r.botellas) || 0;
    let c = parseInt(r.cervezas) || 0;
    let p = parseInt(r.palacete) || 0;
    let b100 = parseInt(r.botellas100) || 0;

    let total = (j * PRECIOS.jarra) + (b * PRECIOS.botella) + (c * PRECIOS.cerveza) + (p * PRECIOS.palacete) + (b100 * PRECIOS.botellas100);

    let parts = r.fecha.split('-'); 
    let fechaObj = new Date(parts[0], parts[1]-1, parts[2]);
    let esSabado = fechaObj.getDay() === 6;
    let metaObjetivo = esSabado ? 15 : 10;
    let puntosMeta = j + b + Math.floor(c / 6);
    let cumplioMeta = puntosMeta >= metaObjetivo;

    if (cumplioMeta) total += PRECIOS.bonoMeta; 
    return { total, meta: cumplioMeta, puntos: puntosMeta, metaObjetivo };
}

// --- FIREBASE OPS ---
async function guardarRegistro() {
    const nombre = document.getElementById('nombreInput').value.trim();
    if (!nombre) return lanzarToast("❌ ¡Falta el nombre!");

    const data = {
        fecha: fechaInput.value, 
        nombre: nombre.toLowerCase(), 
        nombreDisplay: nombre.toUpperCase(),
        jarras: parseInt(document.getElementById('jarras').value) || 0,
        botellas: parseInt(document.getElementById('botellas').value) || 0,
        cervezas: parseInt(document.getElementById('cervezas').value) || 0,
        palacete: parseInt(document.getElementById('palacete').value) || 0,
        botellas100: parseInt(document.getElementById('botellas100').value) || 0, 
        timestamp: new Date()
    };

    btnGuardar.disabled = true;
    try {
        await addDoc(collection(db, "registros"), data);
        lanzarToast("✅ ¡Guardado!");
        ["jarras", "botellas", "cervezas", "palacete", "botellas100", "nombreInput"].forEach(id => document.getElementById(id).value = '');
        document.getElementById('nombreInput').focus();
        await cargarDatos();
    } catch (e) { lanzarToast("❌ Error"); } 
    finally { btnGuardar.disabled = false; }
}

async function cargarDatos() {
    document.getElementById('loading').style.display = 'block';
    const q = query(collection(db, "registros"), orderBy("fecha", "desc"));
    try {
        const querySnapshot = await getDocs(q);
        allRecords = [];
        querySnapshot.forEach((doc) => { allRecords.push({ id: doc.id, ...doc.data() }); });
        renderCalendar();
        renderMiniCalendar(); 
        renderWeeklyReport();
    } catch (e) { console.error(e); } 
    finally { document.getElementById('loading').style.display = 'none'; }
}

// --- RENDERS ---
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    document.getElementById('mesLabel').textContent = `${monthNames[month]} ${year}`;

    ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].forEach(d => grid.innerHTML += `<div class="day-head">${d}</div>`);
    const firstDay = new Date(year, month, 1).getDay();
    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div></div>`;
    
    for(let i=1; i<=new Date(year, month + 1, 0).getDate(); i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        const fechaKey = `${year}-${(month + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        cell.innerHTML = `<span class="day-num">${i}</span>`;
        const registrosDia = allRecords.filter(r => r.fecha === fechaKey);
        registrosDia.forEach(reg => {
            const calc = calcularGanancia(reg);
            const div = document.createElement('div');
            div.className = 'worker-dot';
            div.innerHTML = `${reg.nombreDisplay}${calc.meta ? '⭐' : ''}: <span>${calc.total}</span>`;
            cell.appendChild(div);
        });
        cell.onclick = () => verDetalleDia(fechaKey, registrosDia);
        grid.appendChild(cell);
    }
}

function renderMiniCalendar() {
    const grid = document.getElementById('miniCalendar');
    grid.innerHTML = ''; 
    ['D','L','M','M','J','V','S'].forEach(d => grid.innerHTML += `<div style="text-align:center; font-size:0.7rem; color:#aaa;">${d}</div>`);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div></div>`;

    for(let i=1; i<=new Date(year, month + 1, 0).getDate(); i++) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        const fechaKey = `${year}-${(month + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        cell.textContent = i;
        if(allRecords.some(r => r.fecha === fechaKey)) {
            cell.classList.add('has-money');
            const dot = document.createElement('div'); dot.className = 'mini-dot'; cell.appendChild(dot);
        }
        if(window.paintedDays[fechaKey]) {
            cell.style.backgroundColor = window.paintedDays[fechaKey];
            cell.style.color = '#000'; cell.style.borderColor = 'white';
        }
        cell.onclick = () => window.paintDay(fechaKey);
        grid.appendChild(cell);
    }
}

function verDetalleDia(fecha, registros) {
    const panel = document.getElementById('detalleDia');
    const lista = document.getElementById('listaDetalles');
    panel.style.display = 'block';
    document.getElementById('detalleFechaTitulo').textContent = `Detalles: ${fecha}`;
    lista.innerHTML = registros.length ? '' : '<div style="padding:10px; color:#666;">Sin registros.</div>';
    registros.forEach(r => {
        const calc = calcularGanancia(r);
        const row = document.createElement('div');
        row.className = 'detalle-row';
        row.innerHTML = `
            <div><strong>${r.nombreDisplay}</strong><br><small>${r.jarras}J - ${r.botellas}B - ${r.cervezas}C</small></div>
            <div style="text-align:right; display:flex; align-items:center; gap:10px;">
                <div style="color:var(--success); font-weight:bold;">S/ ${calc.total}</div>
                <button class="btn-borrar" onclick="borrarRegistro('${r.id}')">Eliminar</button>
            </div>`;
        lista.appendChild(row);
    });
    panel.scrollIntoView({ behavior: 'smooth' });
}

// --- LÓGICA DE REPORTES SEMANALES MEJORADA ---
function getSunday(d) {
    d = new Date(d);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function renderWeeklyReport() {
    const container = document.getElementById('listaPagos');
    container.innerHTML = '';
    const weeklyGroups = {};
    const hoy = new Date();
    const domingoActual = getSunday(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    const domingoActualKey = domingoActual.toISOString().split('T')[0];

    allRecords.forEach(r => {
        const parts = r.fecha.split('-');
        const sunday = getSunday(new Date(parts[0], parts[1]-1, parts[2]));
        const key = sunday.toISOString().split('T')[0];
        if(!weeklyGroups[key]) weeklyGroups[key] = {};
        const calc = calcularGanancia(r);
        weeklyGroups[key][r.nombreDisplay] = (weeklyGroups[key][r.nombreDisplay] || 0) + calc.total;
    });

    Object.keys(weeklyGroups).sort().reverse().forEach(key => {
        const sunday = new Date(key + "T00:00:00");
        const options = { day: 'numeric', month: 'short' };
        
        // Identificar si es semana actual o pasada
        const isCurrent = (key === domingoActualKey);
        const statusClass = isCurrent ? 'current-week' : 'past-week';

        let html = `<div class="payment-group ${statusClass}">
            <div class="payment-header">
                <span>SEMANA: ${sunday.toLocaleDateString('es-ES', options)}</span>
                <span class="payment-date">${isCurrent ? '⚡ ACTUAL' : '📅 PASADA'}</span>
            </div>`;
        
        for (const [nom, tot] of Object.entries(weeklyGroups[key])) {
            html += `<div class="payment-row"><span>${nom}</span><span class="pay-amount">S/ ${tot.toFixed(2)}</span></div>`;
        }
        container.innerHTML += html + `</div>`;
    });
}

document.getElementById('btnGuardar').addEventListener('click', guardarRegistro);
document.getElementById('prevMonth').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); renderMiniCalendar(); });
document.getElementById('nextMonth').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); renderMiniCalendar(); });