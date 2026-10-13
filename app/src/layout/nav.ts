export interface NavItem {
  to: string;
  label: string;
  /** exige escopo ativo */
  needsScope: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', needsScope: false },
  { to: '/analise', label: 'Análise', needsScope: true },
  { to: '/produtos', label: 'Produtos', needsScope: true },
  { to: '/modelos', label: 'Modelos', needsScope: true },
  { to: '/itens-modelo', label: 'Itens de modelo', needsScope: true },
  { to: '/itens-produto', label: 'Itens de produto', needsScope: true },
  { to: '/itens-analise', label: 'Itens de análise', needsScope: true },
  { to: '/filtros', label: 'Filtros', needsScope: true },
];
