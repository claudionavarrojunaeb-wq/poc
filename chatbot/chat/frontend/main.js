/* `form` referencia el formulario principal que dispara el envío de la consulta. */
const form = document.getElementById('form');

/* `input` apunta al campo de texto donde el usuario escribe la pregunta. */
const input = document.getElementById('input');

/* `messages` es el contenedor visual donde se renderizan los mensajes del chat. */
const messages = document.getElementById('messages');

/* `append` crea una burbuja visual y la agrega al historial del chat. */
function append(text, cls = 'bot') {
  /* `bubble` es el nuevo nodo DOM que representará un mensaje individual. */
  const bubble = document.createElement('div');

  /* Esta asignación aplica la clase base `bubble` y la variante visual (`bot` o `me`). */
  bubble.className = `bubble ${cls}`;

  /* Esta asignación establece el texto visible del mensaje sin interpretar HTML. */
  bubble.textContent = text;

  /* Esta llamada agrega la nueva burbuja al final del contenedor de mensajes. */
  messages.appendChild(bubble);

  /* Esta asignación fuerza el scroll al fondo para que siempre se vea el último mensaje. */
  messages.scrollTop = messages.scrollHeight;
}

/* Este listener ejecuta el flujo completo del cliente cada vez que el usuario envía el formulario. */
form.addEventListener('submit', async (event) => {
  /* `preventDefault()` evita el refresco completo de la página al enviar el formulario. */
  event.preventDefault();

  /* `questionText` limpia espacios sobrantes de la entrada del usuario. */
  const questionText = input.value.trim();

  /* Este `if` corta el flujo si el usuario intenta enviar una pregunta vacía. */
  if (!questionText) {
    return;
  }

  /* Esta llamada pinta inmediatamente el mensaje del usuario en pantalla. */
  append(questionText, 'me');

  /* Esta asignación limpia el input para dejarlo listo para la siguiente consulta. */
  input.value = '';

  /* Esta llamada agrega una burbuja temporal mientras se espera la respuesta del backend. */
  append('Pensando...', 'bot');

  try {
    /* `response` guarda la respuesta HTTP del backend; se usa `await` porque el request es asíncrono. */
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pregunta: questionText }),
    });

    /* `payload` contiene el JSON devuelto por el backend con `respuesta` o `error`. */
    const payload = await response.json();

    /* `botBubbles` reúne todas las burbujas del bot para localizar la burbuja temporal `Pensando...`. */
    const botBubbles = messages.querySelectorAll('.bubble.bot');

    /* Este `if` verifica si existe al menos una burbuja del bot antes de intentar borrarla. */
    if (botBubbles.length) {
      botBubbles[botBubbles.length - 1].remove();
    }

    /* Este `if` detecta cuando el backend respondió con error funcional o técnico. */
    if (payload.error) {
      append(`Error: ${payload.error}`, 'bot');
    } else {
      /* Este `else` pinta la respuesta normal del chatbot o un fallback si no llegó texto. */
      append(payload.respuesta || 'Sin respuesta', 'bot');
    }
  } catch (error) {
    /* `catch` maneja fallos de red, caída del backend o problemas al interpretar la respuesta. */
    append('Error de red', 'bot');
  }
});
