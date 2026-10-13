import { gerarCsv } from '../domain/csv';
import { paraExportacao, type Tabela } from '../domain/analysis/tabela';
import { baixarBlob } from './backupZip';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'analise';
const hoje = () => new Date().toISOString().slice(0, 10);

/** CSV com TODAS as linhas da consulta atual (a virtualização é só visual). */
export function exportarCsv(t: Tabela, escopoNome: string) {
  const { cabecalho, linhas } = paraExportacao(t);
  baixarBlob(new Blob([gerarCsv(cabecalho, linhas)], { type: 'text/csv;charset=utf-8' }), `analise-${slug(escopoNome)}-${hoje()}.csv`);
}

export async function exportarPdf(t: Tabela, escopoNome: string, resumoFiltros: string) {
  // carregado sob demanda: a biblioteca de PDF é grande e só é usada ao exportar
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { cabecalho, linhas } = paraExportacao(t);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(`Análise — ${escopoNome}`, 40, 36);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · ${linhas.length} linha(s)${resumoFiltros ? ` · ${resumoFiltros}` : ''}`, 40, 52, { maxWidth: 760 });
  autoTable(doc, {
    startY: 64,
    head: [cabecalho],
    body: linhas.map((l) => l.map((c) => (c === null ? '—' : typeof c === 'number' ? String(Math.round(c * 1e6) / 1e6).replace('.', ',') : c))),
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [40, 60, 90] },
    showHead: 'everyPage',
    margin: { left: 40, right: 40, bottom: 40 },
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(`Página ${n}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20);
    },
  });
  baixarBlob(doc.output('blob'), `analise-${slug(escopoNome)}-${hoje()}.pdf`);
}
