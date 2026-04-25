const MENU = {
  cappuccino: { label: 'Cappuccino', price: 1.8, keywords: ['cappuccino', 'capuchino'] },
  espresso: { label: 'Espresso', price: 1.2, keywords: ['espresso', 'expresso'] },
  coldBrew: { label: 'Cold Brew', price: 2.6, keywords: ['cold brew', 'coldbrew'] },
  latte: { label: 'Latte', price: 2.2, keywords: ['latte'] },
  croissant: { label: 'Croissant', price: 1.4, keywords: ['croissant', 'cruasan', 'cuernito'] },
  cake: { label: 'Torta de chocolate', price: 2.9, keywords: ['torta', 'pastel', 'cake', 'chocolate'] },
};

const MODIFIERS = [
  { label: 'leche de avena', text: 'leche de avena' },
  { label: 'sin azúcar', text: 'sin azúcar' },
  { label: 'extra shot', text: 'extra shot' },
  { label: 'tibio', text: 'tibio' },
  { label: 'frío', text: 'frío' },
];

const state = {
  messages: [],
  items: [],
  payment: 'idle',
  txHash: null,
};

const chatWindow = document.getElementById('chatWindow');
const composer = document.getElementById('composer');
const input = document.getElementById('messageInput');
const orderList = document.getElementById('orderList');
const orderCount = document.getElementById('orderCount');
const subtotal = document.getElementById('subtotal');
const total = document.getElementById('total');
const payButton = document.getElementById('payButton');
const paymentStatus = document.getElementById('paymentStatus');
const txHash = document.getElementById('txHash');
const baristaTicket = document.getElementById('baristaTicket');
const ticketBadge = document.getElementById('ticketBadge');
const suggestions = document.querySelectorAll('[data-suggest]');

function money(value) {
  return `${value.toFixed(2)} MON`;
}

function addMessage(role, text) {
  state.messages.push({ role, text });
  const row = document.createElement('div');
  row.className = `msg ${role}`;
  row.innerHTML = `<div class="bubble">${text}</div>`;
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function parseQuantity(text) {
  const match = text.match(/\b([1-5])\b/);
  return match ? Number(match[1]) : 1;
}

function detectItems(text) {
  const normalized = normalize(text);
  const quantity = parseQuantity(normalized);
  const found = [];

  Object.values(MENU).forEach((item) => {
    if (item.keywords.some((keyword) => normalized.includes(keyword))) {
      found.push({ ...item, quantity });
    }
  });

  if (!found.length && normalized.length > 3) {
    found.push({ label: 'Pedido libre', price: 2.0, quantity, note: text });
  }

  return found;
}

function detectModifiers(text) {
  const normalized = normalize(text);
  return MODIFIERS.filter((modifier) => normalized.includes(normalize(modifier.text))).map((modifier) => modifier.text);
}

function itemNotes(item, modifiers, rawText) {
  const notes = [...modifiers];
  if (/para llevar|take away|to go/.test(normalize(rawText))) notes.push('para llevar');
  if (/mesa|aqui|aquí/.test(normalize(rawText))) notes.push('para mesa');
  if (item.note) notes.push(item.note);
  return notes;
}

function addItemsFromText(text, fromSuggestion = false) {
  const items = detectItems(text);
  const modifiers = detectModifiers(text);

  if (!items.length) {
    addMessage('bot', 'No vi un producto del menú, pero puedes probar con cappuccino, espresso, cold brew, croissant o torta de chocolate.');
    return;
  }

  items.forEach((item) => {
    state.items.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: item.label,
      quantity: item.quantity,
      price: item.price,
      notes: itemNotes(item, modifiers, text),
    });
  });

  const summary = items.map((item) => `${item.quantity} × ${item.label}`).join(', ');
  addMessage('bot', fromSuggestion ? `Perfecto. Agregué ${summary}.` : `Listo. Agregué ${summary} al pedido.`);
  render();
}

function removeItem(id) {
  state.items = state.items.filter((item) => item.id !== id);
  render();
}

function subtotalValue() {
  return state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderOrderList() {
  orderList.innerHTML = '';

  if (!state.items.length) {
    orderList.innerHTML = '<div class="empty">Tu pedido aparecerá aquí en cuanto el cliente empiece a conversar.</div>';
    return;
  }

  state.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div>
        <strong>${item.quantity} × ${item.label}</strong>
        <small class="note">${item.notes.length ? item.notes.join(' · ') : 'sin notas'}</small>
      </div>
      <div style="text-align:right">
        <strong>${money(item.price * item.quantity)}</strong>
        <small class="note" data-remove style="cursor:pointer;color:#436d54;font-weight:700">Eliminar</small>
      </div>
    `;
    row.querySelector('[data-remove]').addEventListener('click', () => removeItem(item.id));
    orderList.appendChild(row);
  });
}

function renderTicket() {
  if (!state.items.length) {
    baristaTicket.innerHTML = '<div class="ticket-empty">Aún no hay orden. Cuando el cliente envíe un pedido, aquí aparecerá el formato para barista.</div>';
    ticketBadge.textContent = 'Esperando pedido';
    return;
  }

  const paid = state.payment === 'confirmed';
  ticketBadge.textContent = paid ? 'Pago confirmado' : 'Esperando pago';

  const itemsHtml = state.items.map((item) => `
    <div class="ticket-row">
      <div>
        <strong>${item.quantity} × ${item.label}</strong>
        <div class="meta">${item.notes.length ? item.notes.join(' · ') : 'sin notas'}</div>
      </div>
      <strong>${money(item.price * item.quantity)}</strong>
    </div>
  `).join('');

  baristaTicket.innerHTML = `
    <div class="ticket-header">
      <strong>Mesa digital · Perpetuo Flow</strong>
      <span class="meta">${paid ? 'Liberado para preparación' : 'Bloqueado hasta confirmar pago en $MON'}</span>
    </div>
    ${itemsHtml}
    <div class="ticket-footer">
      <div><span>Total</span><strong>${money(subtotalValue())}</strong></div>
      <div><span>Estado</span><strong>${paid ? 'Listo para barista' : 'Pendiente de pago'}</strong></div>
      <div><span>Referencia</span><strong>${state.txHash ? state.txHash.slice(0, 18) + '…' : '—'}</strong></div>
    </div>
  `;
}

function renderPayment() {
  const totalValue = subtotalValue();
  subtotal.textContent = money(totalValue);
  total.textContent = money(totalValue);
  orderCount.textContent = `${state.items.length} ítems`;

  const paid = state.payment === 'confirmed';
  paymentStatus.textContent = paid ? 'Confirmado' : state.payment === 'pending' ? 'Procesando…' : 'Pendiente';
  paymentStatus.classList.toggle('status-soft', !paid);
  payButton.textContent = paid ? 'Pago confirmado' : 'Confirmar pago en $MON';
  payButton.disabled = paid || !state.items.length;
  payButton.style.opacity = payButton.disabled ? '0.7' : '1';
  txHash.textContent = state.txHash || '—';
}

function render() {
  renderOrderList();
  renderPayment();
  renderTicket();
}

function buildTxHash() {
  const seed = `${Date.now()}-${state.items.map((i) => i.label).join('-')}-${Math.random()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `0x${hex}${Math.random().toString(16).slice(2, 34).padEnd(24, '0')}`;
}

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMessage('user', text);
  addItemsFromText(text);
  input.value = '';
});

suggestions.forEach((button) => {
  button.addEventListener('click', () => {
    const suggestion = button.dataset.suggest;
    addMessage('user', suggestion);
    addItemsFromText(suggestion, true);
  });
});

payButton.addEventListener('click', () => {
  if (!state.items.length || state.payment === 'confirmed') return;
  state.payment = 'pending';
  render();
  addMessage('system', 'Transacción enviada a la red. Esperando confirmación de bloque…');

  window.setTimeout(() => {
    state.payment = 'confirmed';
    state.txHash = buildTxHash();
    render();
    addMessage('system', `Pago confirmado en la demo. Hash: ${state.txHash.slice(0, 18)}…`);
    addMessage('bot', 'Orden liberada. El barista ya puede empezar la preparación.');
  }, 1300);
});

addMessage('bot', 'Hola, soy Perpetuo Flow. Escribe tu pedido como si estuvieras hablando con un cajero.');
addMessage('system', 'Prueba: “un cappuccino con leche de avena y sin azúcar” o usa un botón rápido.');
render();
