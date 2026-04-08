let conveniosData = [];
let convocatoriasData = [];
let convocatoriasActivas = [];

// =========================
// CARGA DE DATOS
// =========================
async function cargarDatos() {
  try {
    const [convRes, convDataRes] = await Promise.all([
      fetch('convocatorias.json'),
      fetch('convenios.json')
    ]);

    if (!convRes.ok || !convDataRes.ok) {
      throw new Error("Error HTTP al cargar JSON");
    }

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

// =========================
// INICIO
// =========================
document.addEventListener("DOMContentLoaded", () => {
  cargarDatos();

  const input = document.getElementById("b_q");

  if (input) {
    // Normalización en vivo
    input.addEventListener("input", function () {
      this.value = normalizarDocumento(this.value);
    });

    // ENTER
    input.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        buscarEmpresa();
      }
    });
  }
});

// =========================
// FECHAS SEGURAS
// =========================
function parseFechaLocal(fechaStr) {
  const [y, m, d] = fechaStr.split("-");
  return new Date(y, m - 1, d);
}

// =========================
// CONVOCATORIAS ACTIVAS
// =========================
function detectarConvocatoriasActivas() {
  const hoy = new Date();

  convocatoriasActivas = convocatoriasData.filter(c => {
    const inicio = parseFechaLocal(c.fecha_inicio);
    const fin = parseFechaLocal(c.fecha_fin);
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

// =========================
// BUSCADOR
// =========================
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

  // Bloqueo legal
  if (tipo === "NIF" || tipo === "NIE") {
    mostrarResultado(`
      <span class="result-warn"><strong>Consulta no permitida.</strong></span><br>
      Este buscador solo admite <strong>CIF de personas jurídicas</strong>.
    `, "warn");
    return;
  }

  if (tipo !== "CIF") {
    mostrarResultado("El documento no tiene formato válido de CIF.", "error");
    return;
  }

  if (!validarCIF(doc)) {
    mostrarResultado("El CIF no es válido.", "error");
    return;
  }

  if (convocatoriasActivas.length === 0) {
    mostrarResultado("No hay convocatorias activas.", "warn");
    return;
  }

  const idsActivas = convocatoriasActivas.map(c => String(c.id));

  const resultados = conveniosData.filter(item => {
    const cifItem = normalizarDocumento(item.cif || "");
    return cifItem === doc && idsActivas.includes(String(item.convocatoria));
  });

  if (resultados.length === 0) {
    mostrarResultado(`
      <span class="result-error">❌ No hay convenio en convocatorias activas (${escapeHtml(convocatoriasActivas.map(c => c.nombre).join(", "))}).</span>
    `, "error");
    return;
  }

  // Empresas únicas
  const empresas = [...new Set(resultados.map(r => r.nombre))];

  // Convocatorias encontradas
  const convocatoriasEncontradas = [...new Set(
    resultados.map(r =>
      convocatoriasData.find(c => String(c.id) === String(r.convocatoria))?.nombre
    ).filter(Boolean)
  )];

  // Centros
  const centros = extraerCentros(resultados);

  let html = `
    <span class="result-ok"><strong>✔ Hay convenio firmado.</strong></span><br>
    <strong>Empresa:</strong> ${escapeHtml(empresas.join(", "))}<br>
    <strong>Convocatoria/s:</strong> ${escapeHtml(convocatoriasEncontradas.join(", "))}
  `;

  if (centros.length > 0) {
    html += `<br><strong>Centros de trabajo:</strong><ul>`;
    html += centros.map(c => `<li>${escapeHtml(c)}</li>`).join("");
    html += `</ul>`;
  }

  html += `
    <div style="margin-top:10px;font-size:12px;color:#475569;">
      Información meramente informativa (solo personas jurídicas).
    </div>
  `;

  mostrarResultado(html, "ok");
}

// =========================
// UTILIDADES
// =========================
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
  return limpio.substring(0, 9);
}

function detectarTipoDocumento(doc) {
  if (/^\d{8}[A-Z]$/.test(doc)) return "NIF";
  if (/^[XYZ]\d{7}[A-Z]$/.test(doc)) return "NIE";
  if (/^[ABCDEFGHJNPQRSUVWLM]\d{7}[A-Z0-9]$/.test(doc)) return "CIF";
  return "OTRO";
}

// =========================
// VALIDACIÓN CIF REAL
// =========================
function validarCIF(cif) {
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
  const digito = (10 - (total % 10)) % 10;
  const letra = "JABCDEFGHI"[digito];

  if ("ABEH".includes(letraInicial)) return control === String(digito);
  if ("KPQS".includes(letraInicial)) return control === letra;

  return control === String(digito) || control === letra;
}

// =========================
// CENTROS
// =========================
function extraerCentros(resultados) {
  const centros = [];

  resultados.forEach(item => {
    if (Array.isArray(item.centros)) {
      item.centros.forEach(c => {
        if (typeof c === "string") {
          centros.push(c.trim());
        } else if (c && typeof c === "object") {
          const texto = [c.nombre, c.direccion, c.municipio]
            .filter(Boolean)
            .join(" · ");
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

// =========================
// SEGURIDAD XSS
// =========================
function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
