/*
 * Tres cronómetros controlados por un solo botón Play.
 *
 * Event Loop:
 *  - TAREAS (macrotareas): cada "tic" de un segundo se programa con setTimeout.
 *    El navegador mete el callback en la cola de tareas cuando pasa el tiempo.
 *  - MICROTAREAS: Promise.then y queueMicrotask. Se ejecutan apenas termina la
 *    tarea actual y ANTES de la siguiente tarea, por eso las usamos para pintar
 *    el display, actualizar el estado y avisar cuando un cronómetro termina.
 */

const btnPlay = document.getElementById('btnPlay');
const btnReiniciar = document.getElementById('btnReiniciar');
const mensajeGlobal = document.getElementById('mensajeGlobal');
const registro = document.getElementById('registro');

const MAX_REGISTROS = 10;

const formatear = (segundos) => {
  const min = String(Math.floor(segundos / 60)).padStart(2, '0');
  const seg = String(segundos % 60).padStart(2, '0');
  return `${min}:${seg}`;
};

function registrar(tipo, texto) {
  const item = document.createElement('li');
  item.innerHTML = `<span class="etiqueta ${tipo}">${tipo === 'tarea' ? 'TAREA' : 'MICRO'}</span> ${texto}`;
  registro.prepend(item);
  while (registro.children.length > MAX_REGISTROS) registro.lastElementChild.remove();
}

class Cronometro {
  constructor(elemento) {
    this.el = elemento;
    this.nombre = elemento.dataset.nombre;
    this.limite = Number(elemento.dataset.limite);
    this.display = elemento.querySelector('.display');
    this.estado = elemento.querySelector('.estado');
    this.barra = elemento.querySelector('.barra span');
    this.inputMin = elemento.querySelector('.minutos');
    this.inputSeg = elemento.querySelector('.segundos');

    this.mostrarLimite();
    [this.inputMin, this.inputSeg].forEach((input) =>
      input.addEventListener('change', () => this.cambiarLimite())
    );
    this.reiniciar();
  }

  mostrarLimite() {
    this.inputMin.value = String(Math.floor(this.limite / 60)).padStart(2, '0');
    this.inputSeg.value = String(this.limite % 60).padStart(2, '0');
  }

  cambiarLimite() {
    const limitar = (valor) => Math.min(59, Math.max(0, Math.floor(Number(valor) || 0)));
    const nuevoLimite = limitar(this.inputMin.value) * 60 + limitar(this.inputSeg.value);

    // Un cronómetro de 00:00 no tendría nada que contar
    if (nuevoLimite > 0) this.limite = nuevoLimite;
    this.mostrarLimite();

    // Con un nuevo límite el cronómetro vuelve a empezar desde ese tiempo
    this.reiniciar();
    limpiarMensaje();
    esperarFinDeTodos();
  }

  bloquearEdicion(bloquear) {
    this.inputMin.disabled = bloquear;
    this.inputSeg.disabled = bloquear;
  }

  get enEjecucion() {
    return this.idTarea !== null;
  }

  reiniciar() {
    clearTimeout(this.idTarea);
    this.idTarea = null;
    // Cuenta regresiva: arranca en el tiempo programado y baja hasta 0
    this.restante = this.limite;
    this.terminado = false;
    // Promesa que se resuelve cuando el cronómetro llega a su límite
    this.finalizado = new Promise((resolver) => (this.resolverFin = resolver));
    this.render();
    this.actualizarEstado();
  }

  iniciar() {
    if (this.enEjecucion || this.terminado) return;
    this.programarTic();
    queueMicrotask(() => this.actualizarEstado());
  }

  pausar() {
    if (!this.enEjecucion) return;
    clearTimeout(this.idTarea);
    this.idTarea = null;
    queueMicrotask(() => this.actualizarEstado());
  }

  programarTic() {
    // Macrotarea: el callback entra a la cola de tareas dentro de 1 segundo
    this.idTarea = setTimeout(() => this.tic(), 1000);
  }

  tic() {
    this.restante--;
    registrar('tarea', `${this.nombre} → tic, quedan ${formatear(this.restante)}`);

    // Microtarea: se pinta el display justo después de esta tarea
    Promise.resolve(this.restante).then((restante) => {
      this.render();
      registrar('micro', `${this.nombre} → render ${formatear(restante)}`);
    });

    if (this.restante <= 0) {
      this.idTarea = null;
      this.terminado = true;
      queueMicrotask(() => {
        this.actualizarEstado();
        registrar('micro', `${this.nombre} llegó a 00:00`);
        this.resolverFin(this.nombre);
      });
      return;
    }

    this.programarTic();
  }

  render() {
    this.display.textContent = formatear(this.restante);
    // La barra se vacía a medida que se acaba el tiempo
    this.barra.style.width = `${(this.restante / this.limite) * 100}%`;
  }

  actualizarEstado() {
    let texto = 'En Pausa';
    let clase = 'pausa';
    if (this.terminado) {
      texto = 'Finalizado ✔';
      clase = 'fin';
    } else if (this.enEjecucion) {
      texto = 'Ejecutando...';
      clase = 'ejecutando';
    }
    this.estado.textContent = texto;
    this.el.dataset.estado = clase;
    // El tiempo solo se puede editar cuando el cronómetro no está corriendo
    this.bloquearEdicion(this.enEjecucion);
  }
}

const cronometros = [...document.querySelectorAll('.crono')].map((el) => new Cronometro(el));

const algunoEnEjecucion = () => cronometros.some((c) => c.enEjecucion);
const todosTerminados = () => cronometros.every((c) => c.terminado);

function actualizarBoton() {
  const corriendo = algunoEnEjecucion();
  btnPlay.classList.toggle('pausa', corriendo);
  btnPlay.setAttribute('aria-label', corriendo ? 'Pausar cronómetros' : 'Iniciar cronómetros');
}

function esperarFinDeTodos() {
  const promesas = cronometros.map((c) => c.finalizado);

  // Cuando los tres terminan, Promise.all se resuelve (microtarea)
  Promise.all(promesas).then(() => {
    if (!todosTerminados()) return; // pertenece a una ronda anterior al reinicio
    mensajeGlobal.textContent = '¡Los tres cronómetros terminaron!';
    mensajeGlobal.classList.add('visible');
    actualizarBoton();
  });
}

btnPlay.addEventListener('click', () => {
  if (todosTerminados()) {
    cronometros.forEach((c) => c.reiniciar());
    limpiarMensaje();
    esperarFinDeTodos();
  }

  if (algunoEnEjecucion()) {
    cronometros.forEach((c) => c.pausar());
  } else {
    cronometros.forEach((c) => c.iniciar());
  }

  // El botón se actualiza en una microtarea, después de cambiar los estados
  queueMicrotask(actualizarBoton);
});

btnReiniciar.addEventListener('click', () => {
  cronometros.forEach((c) => c.reiniciar());
  limpiarMensaje();
  registro.innerHTML = '';
  actualizarBoton();
  esperarFinDeTodos();
});

function limpiarMensaje() {
  mensajeGlobal.textContent = '';
  mensajeGlobal.classList.remove('visible');
}

esperarFinDeTodos();
