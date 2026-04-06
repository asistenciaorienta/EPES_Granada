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
  const cifInput = document.getElementById("b_q").value.trim().toUpperCase();
  const resultadoDiv = document.getElementById("resultadoBusqueda");
  const resultadoTexto = document.getElementById("resultadoTexto");

  if (!cifInput) {
    resultadoTexto.textContent = "Introduce un CIF.";
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
