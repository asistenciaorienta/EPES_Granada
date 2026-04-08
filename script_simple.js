let conveniosData = [];
let convocatoriasData = [];
let convocatoriasActivas = [];

// Cargar datos
async function cargarDatos() {
  try {
    const [convRes, convDataRes] = await Promise.all([
      fetch('convocatorias.json'),
      fetch('convenios.json')
    ]);

    convocatoriasData = await convRes.json();
    conveniosData = await convDataRes.json();

    detectarConvocatoriasActivas();
  } catch (error) {
    console.error('Error cargando datos:', error);
    mostrarResultado(
      'No se han podido cargar los datos del servicio.',
      'error'
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  cargarDatos();

  const input = document.getElementById("b_q");
  if (input) {
    input.addEventListener("input", function () {
      this.value = normalizarDocumento(this.value);
    });
  }
});

// Detectar todas las convocatorias activas
function detectarConvocatoriasActivas() {
  const hoy = new Date();

  convocatoriasActivas = convocatoriasData.filter(c => {
    const inicio = new Date(c.fecha_inicio);
    const fin = new Date(c.fecha_fin);
    return hoy >= inicio && hoy <= fin;
  });

  console.log("Convocatorias activas:", convocatoriasActivas);

  const divConv = document.getElementById("convocatoriaActual");
  if (divConv) {
    if (convocatoriasActivas.length === 0) {
      divConv.textContent = "No hay convocatorias activas";
    } else {
      divConv.textContent =
        "Convocatorias activas: " +
        convocatoriasActivas.map(c => c.nombre).join(", ");
    }
  }
}

// ENTER
function handleEnter(event) {
  if (event.key === "Enter") {
    buscarEmpresa();
  }
}

// Buscar empresa en convocatorias activas
function buscarEmpresa() {
  const inputEl = document.getElementById("b_q");
  let input = inputEl.value;

  const doc = normalizarDocumento(input);
  inputEl.value = doc;

  if (!doc) {
    mostrarResultado("Introduce un CIF de persona jurídica.", "warn");
    return;
  }

  const tipo = detectarTipoDocumento(doc);

  // Bloqueo legal expreso de personas físicas
  if (tipo === "NIF" || tipo === "NIE") {
    mostrarResultado(`
      <span class="result-warn"><strong>Consulta no permitida.</strong></span><br>
      Este buscador únicamente admite consultas mediante <strong>CIF de personas jurídicas</strong>.<br>
      No se ofrece información relativa a <strong>personas físicas</strong>, incluidos NIF o NIE,
      en aplicación del principio de minimización de datos y de las garantías de protección de datos.
    `, "warn");
    return;
  }

  if (tipo !== "CIF") {
    mostrarResultado("El documento introducido no tiene un formato válido de CIF.", "error");
    return;
  }

  if (!validarCIF(doc)) {
    mostrarResultado("El CIF introducido no es válido.", "error");
    return;
  }

  if (convocatoriasActivas.length === 0) {
    mostrarResultado("No hay convocatorias activas.", "warn");
    return;
  }

  const idsActivas = convocatoriasActivas.map(c => c.id);

  const resultados = conveniosData.filter(item => {
    const cifItem = normalizarDocumento(item.cif || "");
    return cifItem === doc && idsActivas.includes(item.convocatoria);
  });

  if (resultados.length === 0) {
    mostrarResultado(`
      <span class="result-error">❌ No hay convenio en las convocatorias activas (${escapeHtml(convocatoriasActivas.map(c => c.nombre).join(", "))}).</span>
    `, "error");
    return;
  }

  // Agrupar centros/direcciones de forma segura
  const nombreEmpresa = resultados[0].nombre || "Empresa";
  const convocatoriasEncontradas = [...new Set(
    resultados.map(r => convocatoriasData.find(c => c.id === r.convocatoria)?.nombre).filter(Boolean)
  )];

  // Ajusta aquí los nombres de campo según tu JSON real
  const centros = extraerCentros(resultados);

  let html = `
    <span class="result-ok"><strong>✔ Hay convenio firmado.</strong></span><br>
    <strong>Empresa:</strong> ${escapeHtml(nombreEmpresa)}<br>
    <strong>Convocatoria/s activa/s:</strong> ${escapeHtml(convocatoriasEncontradas.join(", "))}
  `;

  if (centros.length > 0) {
    html += `<br><strong>Centros de trabajo:</strong><br><ul style="margin:8px 0 0 18px;">`;
    html += centros.map(c => `<li>${escapeHtml(c)}</li>`).join("");
    html += `</ul>`;
  }

  html += `
    <div style="margin-top:10px;font-size:12px;color:#475569;">
      La información mostrada tiene carácter meramente informativo y se limita a personas jurídicas y centros de trabajo de carácter profesional.
    </div>
  `;

  mostrarResultado(html, "ok");
}

function mostrarResultado(html, tipo = "") {
  const resultadoDiv = document.getElementById("resultadoBusqueda");
  const resultadoTexto = document.getElementById("resultadoTexto");

  resultadoTexto.innerHTML = html;
  resultadoTexto.className = "hint";
  if (tipo) {
    resultadoTexto.classList.add(`result-${tipo}`);
  }

  resultadoDiv.style.display = "block";
}

function normalizarDocumento(valor) {
  if (!valor) return "";

  let limpio = valor.replace(/[^a-zA-Z0-9]/g, "");
  limpio = limpio.toUpperCase();
  limpio = limpio.substring(0, 9);

  return limpio;
}

function detectarTipoDocumento(doc) {
  doc = (doc || "").toUpperCase();

  if (/^\d{8}[A-Z]$/.test(doc)) return "NIF";
  if (/^[XYZ]\d{7}[A-Z]$/.test(doc)) return "NIE";
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[A-Z0-9]$/.test(doc)) return "CIF";

  return "OTRO";
}

function validarCIF(cif) {
  cif = cif.toUpperCase();

  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[A-Z0-9]$/.test(cif)) {
    return false;
  }

  const letraInicial = cif[0];
  const numeros = cif.substring(1, 8);
  const control = cif[8];

  let sumaPares = 0;
  let sumaImpares = 0;

  for (let i = 0; i < numeros.length; i++) {
    const n = parseInt(numeros[i], 10);

    if (i % 2 === 0) {
      const mult = n * 2;
      sumaImpares += Math.floor(mult / 10) + (mult % 10);
    } else {
      sumaPares += n;
    }
  }

  const total = sumaPares + sumaImpares;
  const digitoControl = (10 - (total % 10)) % 10;
  const letrasControl = "JABCDEFGHI";
  const letraControl = letrasControl[digitoControl];

  // Solo número de control
  if ("ABEH".includes(letraInicial)) {
    return control === String(digitoControl);
  }

  // Solo letra de control
  if ("KPQS".includes(letraInicial)) {
    return control === letraControl;
  }

  // Puede ser número o letra
  return control === String(digitoControl) || control === letraControl;
}

function extraerCentros(resultados) {
  const centros = [];

  resultados.forEach(item => {
    // Ajusta estos nombres a la estructura real de tu JSON
    if (Array.isArray(item.centros)) {
      item.centros.forEach(c => {
        if (typeof c === "string" && c.trim()) {
          centros.push(c.trim());
        } else if (c && typeof c === "object") {
          const texto = [
            c.nombre,
            c.direccion,
            c.municipio
          ].filter(Boolean).join(" · ");
          if (texto) centros.push(texto);
        }
      });
    } else if (item.centro) {
      centros.push(String(item.centro).trim());
    } else if (item.direccion) {
      centros.push(String(item.direccion).trim());
    }
  });

  return [...new Set(centros)].filter(Boolean);
}

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
