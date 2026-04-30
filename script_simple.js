let conveniosData = [];
let convocatoriasData = [];
let convocatoriasActivas = [];
let estadoPublicacion = null;
let ultimaActualizacionConvenios = "";

// =========================
// AVISO ACTUALIZACIÓN
// =========================
function mostrarAvisoActualizacion(html, tipo = "info") {
  const aviso = document.getElementById("avisoActualizacion");
  if (!aviso) return;

  aviso.innerHTML = html;
  aviso.className = `aviso-actualizacion aviso-${tipo}`;
  aviso.style.display = "block";
}

function ocultarAvisoActualizacion() {
  const aviso = document.getElementById("avisoActualizacion");
  if (!aviso) return;
  aviso.style.display = "none";
  aviso.innerHTML = "";
}

// =========================
// FETCH SIN CACHÉ
// =========================
async function fetchJsonSinCache(url) {
  const separador = url.includes("?") ? "&" : "?";
  const urlFinal = `${url}${separador}v=${Date.now()}`;

  const res = await fetch(urlFinal, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`Error HTTP al cargar ${url}`);
  }

  return res.json();
}

// =========================
// CARGA ESTADO PUBLICACIÓN
// =========================
async function cargarEstadoPublicacion() {
  try {
    estadoPublicacion = await fetchJsonSinCache("estado_publicacion.json");

    if (estadoPublicacion?.actualizando) {
      const fecha = estadoPublicacion.fecha
        ? new Date(estadoPublicacion.fecha).toLocaleString("es-ES")
        : "";

      mostrarAvisoActualizacion(`
        <strong>⚠ La información se está actualizando.</strong><br>
        Puede que los cambios aún no aparezcan en la web de GitHub.<br>
        Prueba de nuevo en unos minutos.
        ${estadoPublicacion.mensaje ? `<br><em>${escapeHtml(estadoPublicacion.mensaje)}</em>` : ""}
        ${fecha ? `<br><small>Último cambio de estado: ${escapeHtml(fecha)}</small>` : ""}
      `, "warn");
    } else {
      ocultarAvisoActualizacion();
    }
  } catch (error) {
    estadoPublicacion = null;
    ocultarAvisoActualizacion();
    console.warn("No se pudo cargar estado_publicacion.json:", error);
  }
}

// =========================
// CARGA DE DATOS
// =========================
async function cargarDatos() {
  try {
    await cargarEstadoPublicacion();

    const [convocatoriasJson, conveniosJson] = await Promise.all([
      fetchJsonSinCache("convocatorias.json"),
      fetchJsonSinCache("convenios.json")
    ]);

    // Soporta tanto formato nuevo { meta, datos } como formato antiguo array
    if (Array.isArray(convocatoriasJson)) {
      convocatoriasData = convocatoriasJson;
    } else {
      convocatoriasData = Array.isArray(convocatoriasJson.datos) ? convocatoriasJson.datos : [];
    }

    if (Array.isArray(conveniosJson)) {
      conveniosData = conveniosJson;
      ultimaActualizacionConvenios = "";
    } else {
      conveniosData = Array.isArray(conveniosJson.datos) ? conveniosJson.datos : [];
      ultimaActualizacionConvenios = conveniosJson.meta?.ultima_actualizacion || "";
    }

    detectarConvocatoriasActivas();
    mostrarUltimaActualizacion();

  } catch (error) {
    console.error("Error cargando datos:", error);
    mostrarResultado(
      "No se han podido cargar los datos del servicio.",
      "error"
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
    input.addEventListener("input", function () {
      this.value = normalizarDocumento(this.value);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        buscarEmpresa();
      }
    });
  }
});

// =========================
// FECHAS SEGURAS
// =========================
function parseFechaLocal(fechaStr) {
  if (!fechaStr || typeof fechaStr !== "string") return null;

  const partes = fechaStr.split("-");
  if (partes.length !== 3) return null;

  const [y, m, d] = partes.map(Number);
  if (!y || !m || !d) return null;

  const fecha = new Date(y, m - 1, d);
  return isNaN(fecha.getTime()) ? null : fecha;
}

// =========================
// CONVOCATORIAS ACTIVAS
// =========================
function detectarConvocatoriasActivas() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); // 🔥 clave

  convocatoriasActivas = convocatoriasData.filter(c => {
    const inicio = parseFechaLocal(c.fecha_inicio);
    const fin = parseFechaLocal(c.fecha_fin);

    if (!inicio || !fin) return false;

    inicio.setHours(0, 0, 0, 0);
    fin.setHours(23, 59, 59, 999); // 🔥 importante

    return hoy >= inicio && hoy <= fin;
  });

  console.log("Convocatorias activas:", convocatoriasActivas);
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

  const empresas = [...new Set(resultados.map(r => r.nombre))];

  const convocatoriasEncontradas = [...new Set(
    resultados.map(r =>
      convocatoriasData.find(c => String(c.id) === String(r.convocatoria))?.nombre
    ).filter(Boolean)
  )];

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

  mostrarResultado(html, "ok");
}

// =========================
// UTILIDADES
// =========================
function mostrarResultado(html, tipo = "") {
  const resultadoDiv = document.getElementById("resultadoBusqueda");
  const resultadoTexto = document.getElementById("resultadoTexto");

  if (!resultadoDiv || !resultadoTexto) return;

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

function mostrarUltimaActualizacion() {
  const div = document.getElementById("infoUltimaActualizacion");
  if (!div) return;

  if (!ultimaActualizacionConvenios) {
    div.innerHTML = "";
    return;
  }

  div.innerHTML = `
    <small><strong>Última actualización publicada:</strong> ${escapeHtml(formatearFechaHora(ultimaActualizacionConvenios))}</small>
  `;
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
        if (c && typeof c === "object") {
          const texto = [
            c.calle,
            c.codigo_postal,
            c.municipio
          ]
          .filter(v => v && v.trim() !== "")
          .join(" · ");

          if (texto) centros.push(texto);
        }
      });
    }
  });

  return [...new Set(centros)];
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

// =========================
// FORMATEAR FECHA
// =========================
function formatearFechaHora(fechaIso) {
  if (!fechaIso) return "";

  const fecha = new Date(fechaIso);

  if (isNaN(fecha.getTime())) return "";

  return fecha.toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "medium"
  });
}
