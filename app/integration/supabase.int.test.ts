import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codigo, configurado, entrar, env, sufixo } from './helpers';

const suite = configurado ? describe : describe.skip;

suite('Supabase real: RLS, integridade, concorrência, storage e realtime', () => {
  let a: SupabaseClient, b: SupabaseClient, uidA: string;
  let escopoId = '', escopoNome = '', escopoVersao = 1;
  let itemM = '', itemP = '';
  const tag = `ZZ_INT_${sufixo()}`;

  beforeAll(async () => {
    ({ sb: a, uid: uidA } = await entrar(env.aEmail, env.aSenha));
    ({ sb: b } = await entrar(env.bEmail, env.bSenha));
    escopoNome = `${tag}_escopo`;
    const e = await a.from('v2_escopos').insert({ nome: escopoNome }).select('id, versao').single();
    expect(e.error).toBeNull();
    escopoId = e.data!.id as string;
    escopoVersao = e.data!.versao as number;
    const im = await a.from('v2_itens_modelo').insert({ escopo_id: escopoId, nome: `${tag}_preco`, tipo: 'numerico' }).select('id').single();
    const ip = await a.from('v2_itens_produto').insert({ escopo_id: escopoId, nome: `${tag}_km`, tipo: 'numerico' }).select('id').single();
    expect(im.error).toBeNull();
    expect(ip.error).toBeNull();
    itemM = im.data!.id as string;
    itemP = ip.data!.id as string;
  }, 60_000);

  afterAll(async () => {
    if (!a || !escopoId) return;
    const atual = await a.from('v2_escopos').select('versao').eq('id', escopoId).maybeSingle();
    const r = await a.rpc('v2_excluir_escopo', { p_id: escopoId, p_versao: atual.data?.versao ?? escopoVersao, p_confirmacao: escopoNome });
    const caminhos = (r.data as { caminhos?: string[] } | null)?.caminhos ?? [];
    if (caminhos.length) await a.storage.from('v2_imagens').remove(caminhos);
    await a.auth.signOut();
    await b?.auth.signOut();
  }, 60_000);

  describe('RLS: o usuário B não alcança dados do A', () => {
    it('B não lê escopo, itens nem configuração do A', async () => {
      for (const t of ['v2_escopos', 'v2_itens_modelo', 'v2_itens_produto', 'v2_config_analise']) {
        const col = t === 'v2_escopos' ? 'id' : 'escopo_id';
        const r = await b.from(t).select('*').eq(col, escopoId);
        expect(r.error, t).toBeNull();
        expect(r.data, t).toEqual([]);
      }
    });
    it('B não altera nem exclui o escopo do A (nenhuma linha afetada)', async () => {
      const up = await b.from('v2_escopos').update({ nome: 'invadido' }).eq('id', escopoId).select();
      expect(up.data ?? []).toEqual([]);
      const del = await b.from('v2_escopos').delete().eq('id', escopoId).select();
      expect(del.data ?? []).toEqual([]);
      const ainda = await a.from('v2_escopos').select('nome').eq('id', escopoId).single();
      expect(ainda.data?.nome).toBe(escopoNome);
    });
    it('B não cria registros dentro do escopo do A', async () => {
      const r = await b.from('v2_itens_modelo').insert({ escopo_id: escopoId, nome: `${tag}_intruso`, tipo: 'numerico' });
      expect(r.error).not.toBeNull();
      const m = await b.rpc('v2_salvar_modelo', { p_escopo_id: escopoId, p_id: null, p_versao: null, p_nome: `${tag}_m_intruso`, p_descricao: null, p_valores: null });
      expect(m.error).not.toBeNull();
    });
    it('B não exclui nem importa sobre o escopo do A', async () => {
      const x = await b.rpc('v2_excluir_escopo', { p_id: escopoId, p_versao: escopoVersao, p_confirmacao: escopoNome });
      expect(x.error).not.toBeNull();
      const i = await b.rpc('v2_importar_escopo', {
        p_payload: { formato: 'auxdec-backup', versao_formato: 1, itens_modelo: [], itens_produto: [], modelos: [], produtos: [], imagens: [], itens_analise: [], filtros: [], config: {} },
        p_modo: 'substituir', p_escopo_id: escopoId, p_nome: 'x', p_descricao: null, p_versao: escopoVersao, p_confirmacao: escopoNome, p_caminhos: {},
      });
      expect(i.error).not.toBeNull();
      const ainda = await a.from('v2_itens_modelo').select('id').eq('id', itemM).single();
      expect(ainda.data?.id).toBe(itemM);
    });
    it('chamada sem login é recusada nas RPCs', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const anon = createClient(env.url, env.key, { auth: { persistSession: false } });
      const r = await anon.rpc('v2_salvar_modelo', { p_escopo_id: escopoId, p_id: null, p_versao: null, p_nome: 'x', p_descricao: null, p_valores: null });
      expect(r.error).not.toBeNull();
      const s = await anon.from('v2_escopos').select('id').eq('id', escopoId);
      expect(s.data ?? []).toEqual([]);
    });
  });

  describe('Integridade e concorrência', () => {
    it('versão desatualizada é recusada (V2001) e a edição certa passa', async () => {
      const m = await a.rpc('v2_salvar_modelo', { p_escopo_id: escopoId, p_id: null, p_versao: null, p_nome: `${tag}_modelo`, p_descricao: null, p_valores: [{ item_modelo_id: itemM, valor_num: 10, valor_txt: null, valor_img_id: null }] });
      expect(m.error).toBeNull();
      const { id, versao } = m.data as { id: string; versao: number };
      const ok = await a.rpc('v2_salvar_modelo', { p_escopo_id: escopoId, p_id: id, p_versao: versao + 1, p_nome: `${tag}_modelo2`, p_descricao: null, p_valores: null });
      expect(ok.error).toBeNull();
      const velha = await a.rpc('v2_salvar_modelo', { p_escopo_id: escopoId, p_id: id, p_versao: versao + 1, p_nome: `${tag}_modelo3`, p_descricao: null, p_valores: null });
      expect(codigo(velha.error)).toBe('V2001');
      const lido = await a.from('v2_modelos').select('nome').eq('id', id).single();
      expect(lido.data?.nome).toBe(`${tag}_modelo2`); // a edição recusada não gravou nada
    });
    it('duas sessões do mesmo usuário: a segunda a salvar recebe V2001', async () => {
      const { sb: a2 } = await entrar(env.aEmail, env.aSenha);
      const it = await a.from('v2_itens_modelo').insert({ escopo_id: escopoId, nome: `${tag}_conc`, tipo: 'numerico' }).select('id, versao').single();
      const { id, versao } = it.data as { id: string; versao: number };
      const r1 = await a.from('v2_itens_modelo').update({ unidade: 'x', versao: versao + 1 }).eq('id', id).select('versao').single();
      expect(r1.error).toBeNull();
      const r2 = await a2.from('v2_itens_modelo').update({ unidade: 'y', versao: versao + 1 }).eq('id', id).select('versao').single();
      expect(codigo(r2.error)).toBe('V2001');
      await a2.auth.signOut();
    });
    it('nome repetido no escopo é recusado', async () => {
      const r = await a.from('v2_itens_modelo').insert({ escopo_id: escopoId, nome: `${tag}_PRECO`, tipo: 'numerico' });
      expect(r.error).not.toBeNull(); // mesmo nome, só muda a caixa
    });
    it('agregado exige de 2 a 5 componentes (V2010)', async () => {
      const um = [{ peso: 5, direcao: 'maior', lmin: 0, lmax: 10, item_modelo_id: itemM }];
      const r = await a.rpc('v2_salvar_analise_agregado', { p_escopo_id: escopoId, p_id: null, p_versao: null, p_nome: `${tag}_ag`, p_descricao: null, p_peso: 5, p_componentes: um });
      expect(codigo(r.error)).toBe('V2010');
    });
    it('ciclo entre fórmulas é bloqueado (V2004) e fórmula com referência válida é aceita', async () => {
      const f1 = await a.rpc('v2_salvar_analise_formula', { p_escopo_id: escopoId, p_id: null, p_versao: null, p_nome: `${tag}_f1`, p_descricao: null, p_formula_texto: `[[m:${itemM}]] + [[p:${itemP}]]` });
      expect(f1.error).toBeNull();
      const { id: id1, versao: v1 } = f1.data as { id: string; versao: number };
      const f2 = await a.rpc('v2_salvar_analise_formula', { p_escopo_id: escopoId, p_id: null, p_versao: null, p_nome: `${tag}_f2`, p_descricao: null, p_formula_texto: `[[a:${id1}]] * 2` });
      expect(f2.error).toBeNull();
      const { id: id2 } = f2.data as { id: string };
      const ciclo = await a.rpc('v2_salvar_analise_formula', { p_escopo_id: escopoId, p_id: id1, p_versao: v1 + 1, p_nome: `${tag}_f1`, p_descricao: null, p_formula_texto: `[[a:${id2}]] + 1` });
      expect(codigo(ciclo.error)).toBe('V2004');
    });
    it('item usado numa fórmula não pode ser excluído', async () => {
      const r = await a.from('v2_itens_modelo').delete().eq('id', itemM).select();
      expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
      const ainda = await a.from('v2_itens_modelo').select('id').eq('id', itemM);
      expect(ainda.data).toHaveLength(1);
    });
    it('excluir escopo exige versão e nome corretos (V2014 / V2001)', async () => {
      const errada = await a.rpc('v2_excluir_escopo', { p_id: escopoId, p_versao: 9999, p_confirmacao: escopoNome });
      expect(codigo(errada.error)).toBe('V2001');
      const nome = await a.rpc('v2_excluir_escopo', { p_id: escopoId, p_versao: escopoVersao, p_confirmacao: 'nome errado' });
      expect(['V2014', 'V2001']).toContain(codigo(nome.error)); // V2001 se a versão do escopo mudou durante os testes
      const ainda = await a.from('v2_escopos').select('id').eq('id', escopoId);
      expect(ainda.data).toHaveLength(1);
    });
  });

  describe('Storage: o bucket é privado e isolado por usuário', () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    let caminho = '';
    it('A envia arquivo na própria pasta; B não baixa, não lista e não grava ali', async () => {
      caminho = `${uidA}/${escopoId}/${tag}.png`;
      const up = await a.storage.from('v2_imagens').upload(caminho, png, { contentType: 'image/png' });
      expect(up.error).toBeNull();
      const baixaA = await a.storage.from('v2_imagens').download(caminho);
      expect(baixaA.error).toBeNull();
      const baixaB = await b.storage.from('v2_imagens').download(caminho);
      expect(baixaB.error).not.toBeNull();
      const lista = await b.storage.from('v2_imagens').list(`${uidA}/${escopoId}`);
      expect(lista.data ?? []).toEqual([]);
      const grava = await b.storage.from('v2_imagens').upload(`${uidA}/${escopoId}/${tag}_b.png`, png, { contentType: 'image/png' });
      expect(grava.error).not.toBeNull();
      const apaga = await b.storage.from('v2_imagens').remove([caminho]);
      expect(apaga.data ?? []).toEqual([]);
      const aindaLa = await a.storage.from('v2_imagens').download(caminho);
      expect(aindaLa.error).toBeNull();
    });
    it('URL pública não funciona (bucket privado)', async () => {
      const { data } = a.storage.from('v2_imagens').getPublicUrl(caminho);
      const resp = await fetch(data.publicUrl);
      expect(resp.ok).toBe(false);
    });
    it('limpeza do arquivo de teste', async () => {
      const r = await a.storage.from('v2_imagens').remove([caminho]);
      expect(r.error).toBeNull();
    });
  });

  describe('Realtime', () => {
    it('uma segunda sessão do mesmo usuário recebe a alteração em até 15 s', async () => {
      const { sb: a2 } = await entrar(env.aEmail, env.aSenha);
      const recebido = new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('sem evento realtime em 15 s')), 15_000);
        a2.channel(`int-${tag}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_modelos', filter: `escopo_id=eq.${escopoId}` }, (p) => {
            clearTimeout(t);
            resolve(p.eventType);
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await a.rpc('v2_salvar_modelo', { p_escopo_id: escopoId, p_id: null, p_versao: null, p_nome: `${tag}_rt`, p_descricao: null, p_valores: null });
            }
          });
      });
      expect(await recebido).toBe('INSERT');
      await a2.removeAllChannels();
      await a2.auth.signOut();
    }, 30_000);
    it('o usuário B NÃO recebe eventos do escopo do A', async () => {
      const eventos: string[] = [];
      await new Promise<void>((resolve) => {
        b.channel(`int-b-${tag}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'v2_modelos', filter: `escopo_id=eq.${escopoId}` }, (p) => eventos.push(p.eventType))
          .subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); });
      });
      await a.rpc('v2_salvar_modelo', { p_escopo_id: escopoId, p_id: null, p_versao: null, p_nome: `${tag}_rt2`, p_descricao: null, p_valores: null });
      await new Promise((r) => setTimeout(r, 5000));
      expect(eventos).toEqual([]);
      await b.removeAllChannels();
    }, 30_000);
  });
});
