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
  }
}

document.addEventListener("DOMContentLoaded", cargarDatos);


// Detectar todas las convocatorias activas
function detectarConvocatoriasActivas() {
  const hoy = new Date();

  convocatoriasActivas = convocatoriasData.filter(c => {
    const inicio = new Date(c.fecha_inicio);
    const fin = new Date(c.fecha_fin);
    return hoy >= inicio && hoy <= fin;
  });

  console.log("Convocatorias activas:", convocatoriasActivas);

  // Mostrar al usuario (opcional)
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


// Buscar empresa en TODAS las convocatorias activas
function buscarEmpresa() {
  let input = document.getElementById("b_q").value;

  const cifInput = normalizarCIF(input);

  const resultadoDiv = document.getElementById("resultadoBusqueda");
  const resultadoTexto = document.getElementById("resultadoTexto");

  // Reflejar el CIF ya limpio en el input
  document.getElementById("b_q").value = cifInput;

  if (!cifInput) {
    resultadoTexto.textContent = "Introduce un CIF.";
    resultadoDiv.style.display = "block";
    return;
  }

  if (cifInput.length !== 9 || !esCIFValido(cifInput)) {
    resultadoTexto.textContent = "Formato de CIF no válido. El CIF debe tener 9 caracteres (letra + 7/8 números + control).";
    resultadoDiv.style.display = "block";
    return;
  }

  if (convocatoriasActivas.length === 0) {
    resultadoTexto.textContent = "No hay convocatorias activas.";
    resultadoDiv.style.display = "block";
    return;
  }

  // Filtrar convenios que pertenezcan a cualquiera de las convocatorias activas
  const idsActivas = convocatoriasActivas.map(c => c.id);

  const resultado = conveniosData.find(
    item => item.cif.toUpperCase() === cifInput && idsActivas.includes(item.convocatoria)
  );

  if (resultado) {
    const convNombre = convocatoriasData.find(c => c.id === resultado.convocatoria)?.nombre;
    resultadoTexto.innerHTML = `
      <strong>Empresa:</strong> ${resultado.nombre}<br>
      ✔ Hay convenio firmado en la convocatoria ${convNombre}.
    `;
  } else {
    resultadoTexto.innerHTML = `
      ❌ No hay convenio en las convocatorias activas (${convocatoriasActivas.map(c => c.nombre).join(", ")}).
    `;
  }

  resultadoDiv.style.display = "block";
}

function normalizarCIF(valor) {
  if (!valor) return "";

  // Quitar todo lo que no sea letra o número
  let limpio = valor.replace(/[^a-zA-Z0-9]/g, "");

  // Mayúsculas
  limpio = limpio.toUpperCase();

  // Limitar a 9 caracteres
  limpio = limpio.substring(0, 9);

  return limpio;
}


// Validar formato CIF/NIF empresa
function esCIFValido(cif) {
  const regex = /^[A-Z]\d{7}[A-Z0-9]$|^\d{8}[A-Z]$/;
  return regex.test(cif);
}

document.getElementById("b_q").addEventListener("input", function () {
  this.value = normalizarCIF(this.value);
});

