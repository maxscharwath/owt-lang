// Hand-written keyed baseline in the spirit of frameworks/keyed/vanillajs:
// rows are cloned from a prototype <tr>, clicks are delegated on <tbody>,
// and every operation touches only the DOM nodes it has to.
import { buildData, type Row } from '../../../shared/data';

interface RowEntry {
  id: number;
  label: string;
  tr: HTMLTableRowElement;
  text: Node;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
}

const tbody = byId('tbody');
const proto = document.createElement('tr');
proto.innerHTML =
  '<td class="col-md-1"> </td><td class="col-md-4"><a> </a></td>' +
  '<td class="col-md-1"><a><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>' +
  '<td class="col-md-6"></td>';

let rows: RowEntry[] = [];
let selectedTr: HTMLTableRowElement | null = null;

function createRow(data: Row): RowEntry {
  const tr = document.importNode(proto, true);
  const idCell = tr.firstChild!;
  idCell.firstChild!.nodeValue = String(data.id);
  const text = idCell.nextSibling!.firstChild!.firstChild!;
  text.nodeValue = data.label;
  return { id: data.id, label: data.label, tr, text };
}

function appendRows(count: number) {
  const data = buildData(count);
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < data.length; i++) {
    const entry = createRow(data[i]!);
    rows.push(entry);
    fragment.appendChild(entry.tr);
  }
  tbody.appendChild(fragment);
}

function clearRows() {
  tbody.textContent = '';
  rows = [];
  selectedTr = null;
}

function replaceRows(count: number) {
  if (rows.length) clearRows();
  appendRows(count);
}

function update() {
  for (let i = 0; i < rows.length; i += 10) {
    const entry = rows[i]!;
    entry.label += ' !!!';
    entry.text.nodeValue = entry.label;
  }
}

function swapRows() {
  if (rows.length <= 998) return;
  const a = rows[1]!;
  const b = rows[998]!;
  const afterA = a.tr.nextSibling;
  tbody.insertBefore(a.tr, b.tr.nextSibling);
  tbody.insertBefore(b.tr, afterA);
  rows[1] = b;
  rows[998] = a;
}

function select(tr: HTMLTableRowElement) {
  if (selectedTr) selectedTr.className = '';
  tr.className = 'danger';
  selectedTr = tr;
}

function remove(tr: HTMLTableRowElement) {
  const idx = rows.findIndex((r) => r.tr === tr);
  if (idx < 0) return;
  rows.splice(idx, 1);
  tr.remove();
  if (selectedTr === tr) selectedTr = null;
}

const actions: Record<string, () => void> = {
  run: () => replaceRows(1000),
  runlots: () => replaceRows(10000),
  add: () => appendRows(1000),
  update,
  clear: clearRows,
  swaprows: swapRows,
};

for (const [id, action] of Object.entries(actions)) {
  byId(id).addEventListener('click', action);
}

tbody.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest('a');
  const tr = link?.closest('tr');
  if (!link || !tr) return;
  if (link.parentElement === tr.cells[1]) select(tr);
  else remove(tr);
});
