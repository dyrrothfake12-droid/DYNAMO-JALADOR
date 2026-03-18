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
    await limpiezaMensualAutomatica();
    await cargarDatos();
}
iniciarApp();

// --- FUNCIÓN DE LIMPIEZA AUTOMÁTICA (CADA MES Y MEDIO) ---
async function limpiezaMensualAutomatica() {
    const ultimaLimpieza = localStorage.getItem('ultimaLimpiezaDynamo');
    const hoy = new Date();
    const limiteMs = 45 * 24 * 60 * 60 * 1000;

    if (!ultimaLimpieza || (hoy - new Date(ultimaLimpieza)) > limiteMs) {
        console.log("Iniciando limpieza de datos antiguos (más de 45 días)...");
        const hace45Dias = new Date();
        hace45Dias.setDate(hace45Dias.getDate() - 45);
        const fechaLimiteStr = hace45Dias.toISOString().split('T')[0];

        const q = query(collection(db, "registros"), where("fecha", "<", fechaLimiteStr));
        try {
            const snapshot = await getDocs(q);
            const promesasBorrado = snapshot.docs.map(d => deleteDoc(doc(db, "registros", d.id)));
            await Promise.all(promesasBorrado);
            localStorage.setItem('ultimaLimpiezaDynamo', hoy.toISOString());
            console.log(`Limpieza completada. Se eliminaron registros anteriores al: ${fechaLimiteStr}`);
        } catch (error) { console.error("Error en limpieza:", error); }
    }
}

// --- LÓGICA DE BLOQUEO ---
let lockTimer;
window.unlockRegistry = function() {
    const password = prompt("Ingrese contraseña de administrador:");
    if (password === "caracolito") {
        document.getElementById('lockOverlay').style.display = 'none';
        lanzarToast("🔓 Sistema desbloqueado por 20 min");
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = setTimeout(() => {
            document.getElementById('lockOverlay').style.display = 'flex';
            lanzarToast("🔒 Sistema bloqueado");
        }, 1200000); 
    } else { 
        alert("Contraseña incorrecta"); 
    }
}

// --- BORRAR REGISTRO MANUAL ---
window.borrarRegistro = async function(id) {
    const password = prompt("Contraseña para BORRAR:");
    if (password !== "caracolito") return alert("Error.");

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
if(notasArea) {
    if(localStorage.getItem('dynamoNotas')) notasArea.value = localStorage.getItem('dynamoNotas');
    notasArea.addEventListener('input', function() { localStorage.setItem('dynamoNotas', this.value); });
}

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
    let rol = r.rol || 'jalador';
    let j = parseInt(r.jarras) || 0;
    let b = parseInt(r.botellas) || 0;
    let c = parseInt(r.cervezas) || 0;
    let p = parseInt(r.palacete) || 0;
    let b100 = parseInt(r.botellas100) || 0;
    let cig = parseInt(r.cigarros) || 0;

    let total = 0;
    let meta = false;

    if (rol === 'barra') {
        // Lógica de pago Barra: Pago fijo 70
        total = 70;
    } else if (rol === 'mozo') {
        // Lógica de pago Mozo
        total = 50 + (j * 1) + (b * 2);
        if (cig > 5) total += 5; 
    } else {
        // Lógica de pago Jalador
        total = (j * PRECIOS.jarra) + (b * PRECIOS.botella) + (c * PRECIOS.cerveza) + (p * PRECIOS.palacete) + (b100 * PRECIOS.botellas100);
        let parts = r.fecha.split('-'); 
        let fechaObj = new Date(parts[0], parts[1]-1, parts[2]);
        let esSabado = fechaObj.getDay() === 6;
        let metaObjetivo = esSabado ? 15 : 10;
        let puntosMeta = j + b + Math.floor(c / 6);
        meta = puntosMeta >= metaObjetivo;
        if (meta) total += PRECIOS.bonoMeta; 
    }

    return { total, meta, rol, j, b, c, cig };
}

// --- FIREBASE OPS ---
async function guardarRegistro() {
    const nombre = document.getElementById('nombreInput').value.trim();
    if (!nombre) return lanzarToast("❌ ¡Falta el nombre!");

    const data = {
        fecha: fechaInput.value, 
        nombre: nombre.toLowerCase(), 
        nombreDisplay: nombre.toUpperCase(),
        rol: document.getElementById('rolInput').value,
        jarras: parseInt(document.getElementById('jarras').value) || 0,
        botellas: parseInt(document.getElementById('botellas').value) || 0,
        cervezas: parseInt(document.getElementById('cervezas').value) || 0,
        palacete: parseInt(document.getElementById('palacete').value) || 0,
        botellas100: parseInt(document.getElementById('botellas100').value) || 0, 
        cigarros: parseInt(document.getElementById('cigarros').value) || 0,
        timestamp: new Date()
    };

    btnGuardar.disabled = true;
    try {
        await addDoc(collection(db, "registros"), data);
        lanzarToast("✅ ¡Guardado!");
        ["jarras", "botellas", "cervezas", "palacete", "botellas100", "cigarros", "nombreInput"].forEach(id => document.getElementById(id).value = '');
        document.getElementById('rolInput').value = 'jalador';
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
            
            let labelRol = '';
            if(calc.rol === 'mozo') labelRol = ' <span style="color:var(--warning); font-size:0.7rem;">(M)</span>';
            if(calc.rol === 'barra') labelRol = ' <span style="color:var(--secondary); font-size:0.7rem;">(B)</span>';

            div.innerHTML = `${reg.nombreDisplay}${labelRol}${calc.meta ? '⭐' : ''}: <span>${calc.total}</span>`;
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
        
        let infoExtras = '';
        if(calc.rol === 'barra') infoExtras = `<span style="color:var(--secondary)">(Barra - Fijo)</span>`;
        else if(calc.rol === 'mozo') infoExtras = `${calc.j}J - ${calc.b}B - ${calc.cig}Cig <span style="color:var(--warning)">(Mozo)</span>`;
        else infoExtras = `${calc.j}J - ${calc.b}B - ${calc.c}C`;

        row.innerHTML = `
            <div><strong>${r.nombreDisplay}</strong><br><small>${infoExtras}</small></div>
            <div style="text-align:right; display:flex; align-items:center; gap:10px;">
                <div style="color:var(--success); font-weight:bold;">S/ ${calc.total}</div>
                <button class="btn-borrar" onclick="borrarRegistro('${r.id}')">Eliminar</button>
            </div>`;
        lista.appendChild(row);
    });
    panel.scrollIntoView({ behavior: 'smooth' });
}

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
        const parts = key.split('-');
        const sunday = new Date(parts[0], parts[1]-1, parts[2]);
        const options = { day: 'numeric', month: 'short' };
        
        const isCurrent = (key === domingoActualKey);
        let statusClass = '';
        let badgeText = '';

        if (isCurrent) {
            statusClass = 'current-week';
            badgeText = '⚡ EN CURSO';
        } else {
            let fechaLimitePago = new Date(sunday);
            fechaLimitePago.setDate(fechaLimitePago.getDate() + 10);
            fechaLimitePago.setHours(11, 0, 0, 0); 

            if (hoy < fechaLimitePago) {
                statusClass = 'pending-week';
                badgeText = '⏳ PENDIENTE';
            } else {
                statusClass = 'past-week';
                badgeText = '✅ PAGADO';
            }
        }

        let html = `<div class="payment-group ${statusClass}">
            <div class="payment-header">
                <span>SEMANA: ${sunday.toLocaleDateString('es-ES', options)}</span>
                <span class="payment-date">${badgeText}</span>
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
