PROMPT MESTRE — SISTEMA DE SUPORTE À DECISÃO (DSS) PARA COMPARAÇÃO DE PRODUTOS
1. PAPEL E OBJETIVO
Atue como arquiteto de software, engenheiro de software full-stack e especialista em bancos de dados, segurança de aplicações web, interfaces responsivas e sistemas de suporte à decisão.
Desenvolva um Sistema de Suporte à Decisão (Decision Support System — DSS) em formato de aplicação web, voltado a um único usuário doméstico autenticado, que permita cadastrar, organizar, comparar e classificar produtos com base em dados, fórmulas matemáticas, critérios normalizados, agregados ponderados e filtros configuráveis.
O sistema deverá permitir a comparação de categorias variadas de produtos, como imóveis, veículos, celulares, computadores, eletrodomésticos e outros bens ou serviços que possam ser representados por atributos.
O desenvolvimento deverá priorizar:
Correção dos cálculos e dos rankings.
Integridade dos dados e das referências.
Interface simples, consistente, responsiva e acessível.
Salvamento explícito e previsível.
Sincronização confiável entre abas e sessões.
Segurança no banco de dados e no armazenamento de arquivos.
Código organizado, testável e documentado.
Facilidade de manutenção e evolução.
Implemente uma aplicação funcional, não apenas uma demonstração visual ou um protótipo com dados simulados.
Regra fundamental: antes de implementar o banco de dados, defina e apresente o modelo de dados completo, suas relações, restrições, dependências e regras de integridade. Não gere as migrações SQL definitivas antes de concluir essa etapa.
2. TECNOLOGIAS E ARQUITETURA
Utilize obrigatoriamente as seguintes tecnologias:
Frontend: React com TypeScript.
Ferramenta de build: Vite.
Banco de dados: Supabase Database, utilizando PostgreSQL.
Autenticação: Supabase Auth, com login e senha.
Armazenamento de imagens: Supabase Storage.
Atualizações em tempo real: Supabase Realtime.
Hospedagem do frontend: GitHub Pages.
Integração contínua: GitHub Actions.
Testes: testes unitários, de integração e de interface.
A aplicação deverá funcionar exclusivamente com conexão à internet. Não é necessário implementar modo offline.
2.1. Arquitetura e segurança
Utilize o frontend hospedado no GitHub Pages para acessar diretamente o Supabase por meio das APIs oficiais.
Não implemente um servidor de aplicação próprio, salvo se alguma necessidade técnica indispensável for identificada e justificada.
Nunca exponha chaves administrativas, como service_role, ou qualquer segredo privilegiado no frontend, no repositório ou nos arquivos de build.
Utilize somente as chaves públicas apropriadas para clientes e proteja os dados por meio de autenticação e políticas de segurança no banco.
Implemente políticas RLS (Row Level Security) em todas as tabelas que contenham dados privados ou acessíveis por meio da API.
Restrinja os dados ao usuário autenticado autorizado, inclusive em operações de leitura, gravação, exclusão, importação e exportação.
Configure políticas de acesso ao Supabase Storage para proteger as imagens.
Considere que esconder botões ou rotas na interface não constitui controle de segurança suficiente.
Valide dados tanto no frontend quanto no banco de dados, conforme aplicável.
Como o sistema será utilizado por um único usuário doméstico, não implemente funcionalidades desnecessárias de administração de equipes, compartilhamento entre usuários ou gerenciamento de papéis complexos.
3. ORGANIZAÇÃO GERAL DOS DADOS
O sistema deverá ser organizado em escopos independentes.
Um escopo representa uma categoria de comparação, como “Imóveis”, “Veículos” ou “Celulares”.
Cada escopo terá seu próprio conjunto de:
Modelos.
Produtos.
Itens de modelo.
Itens de produto.
Itens de análise.
Filtros salvos.
Configurações persistentes de apresentação da análise.
Os dados e as configurações de um escopo não poderão interferir nos demais.
3.1. Regras dos escopos
O usuário poderá criar, editar, exportar, importar e excluir escopos.
Ao abrir o sistema pela primeira vez, deverá ser possível criar o primeiro escopo.
A tela inicial será um dashboard com acesso aos escopos recentes e à criação de um novo escopo.
O usuário poderá selecionar o escopo ativo por meio de um seletor no cabeçalho ou em local de fácil acesso.
Ao trocar de escopo, o sistema deverá carregar os dados correspondentes e atualizar a visualização.
Não misture registros de escopos diferentes em tabelas, fórmulas, agregados, filtros ou rankings.
Todos os nomes sujeitos a unicidade deverão ser comparados sem distinção entre maiúsculas e minúsculas, dentro do respectivo escopo.
3.2. Identificadores e relacionamentos
Utilize identificadores internos estáveis para os registros. Não utilize o nome do item como chave primária nem como única forma de estabelecer referências.
Renomear um item deverá atualizar sua representação visual, sem invalidar fórmulas, agregados, filtros ou relacionamentos que dependam de seu identificador interno.
Antes de criar o banco, identifique as entidades, os relacionamentos, as cardinalidades, as chaves estrangeiras, as restrições únicas, as regras de exclusão e os campos necessários ao controle de versão.
4. ENTIDADES PRINCIPAIS
4.1. Modelo
Um modelo é um template que define características reutilizáveis de um tipo de produto.
Exemplos:
Apartamento de dois quartos.
Honda CR-V de determinada geração.
Celular de determinado modelo.
Cada modelo pertence a um único escopo e poderá conter vários itens de modelo.
Operações obrigatórias:
Criar.
Consultar.
Editar.
Duplicar.
Excluir, respeitando as dependências.
O nome do modelo será obrigatório e único, sem distinção entre maiúsculas e minúsculas, dentro do escopo.
Um modelo deverá poder ser utilizado por vários produtos.
4.2. Produto
Um produto representa uma instância individual que será avaliada e comparada.
Exemplos:
Um imóvel específico anunciado para venda.
Um veículo específico com quilometragem e preço próprios.
Um celular específico oferecido por determinado vendedor.
Cada produto pertence a um escopo e terá nome obrigatório e único, sem distinção entre maiúsculas e minúsculas, dentro desse escopo.
Operações obrigatórias:
Criar.
Consultar.
Editar.
Duplicar.
Excluir, respeitando as dependências.
Associar a um modelo.
Desassociar de um modelo, quando necessário.
A criação de um produto sem modelo será permitida. Ele poderá ser utilizado na análise com seus próprios itens.
4.3. Item de modelo
Define um atributo reutilizável nos modelos.
Exemplos: quantidade de quartos, capacidade do tanque, memória RAM ou capacidade de armazenamento.
Cada item de modelo deverá conter, conforme aplicável:
Identificador interno estável.
Nome.
Descrição.
Tipo de dado.
Unidade de medida, quando aplicável.
Restrições numéricas opcionais.
Valor padrão apropriado.
Escopo ao qual pertence.
Tipos de dados permitidos:
Numérico.
Textual.
Imagem.
Os nomes deverão ser únicos, sem distinção entre maiúsculas e minúsculas, dentro do escopo.
O tipo de dado não poderá ser alterado após a criação do item. Para mudar o tipo, será necessário remover o item e criar outro, respeitando as dependências.
4.4. Item de produto
Define um atributo específico de cada produto.
Exemplos: preço anunciado, quilometragem, contato do vendedor, endereço, link do anúncio ou fotografias.
Deverá conter estrutura semelhante à do item de modelo, incluindo identificador interno estável, nome, descrição, tipo, unidade e restrições aplicáveis.
Os nomes deverão ser únicos, sem distinção entre maiúsculas e minúsculas, dentro do escopo.
Os itens de produto são independentes dos itens herdados do modelo.
4.5. Item de análise
Um item de análise representa um resultado utilizado na comparação dos modelos e produtos.
Existirão dois tipos:
Item de análise baseado em fórmula.
Item de análise agregado.
Cada item de análise deverá ter identificador estável, nome único por escopo, descrição opcional e configurações específicas do seu tipo.
O tipo do item de análise deverá ser definido na criação e não poderá ser alterado de forma que invalide suas dependências.
4.6. Filtro
Um filtro representa uma regra reutilizável para selecionar os registros exibidos na tela de análise.
Deverá conter nome, descrição opcional, condições, operador lógico interno quando houver múltiplas condições e estado de ativação na análise.
Os filtros salvos serão gerenciados em uma tela própria.
5. HERANÇA ENTRE MODELOS E PRODUTOS
A associação entre produto e modelo será opcional, mas a herança deverá funcionar de forma automática quando houver associação.
5.1. Comportamento da herança
Quando um produto for associado a um modelo:
Os itens de modelo aplicáveis deverão aparecer automaticamente na visualização do produto.
Os valores herdados serão obtidos a partir do modelo associado.
Alterações nos valores dos itens de modelo deverão refletir automaticamente nos produtos associados.
A inclusão de um novo item no modelo deverá disponibilizar esse item aos produtos associados.
A remoção de um item do modelo deverá exigir confirmação e verificação de dependências antes da efetivação.
Não crie cópias independentes dos valores herdados que possam divergir silenciosamente do modelo.
A implementação poderá utilizar referências dinâmicas, consultas ou outra estratégia técnica equivalente, desde que preserve a herança automática e a integridade dos dados.
5.2. Itens próprios
Os itens de produto continuarão independentes dos itens de modelo.
O usuário poderá criar e editar itens próprios do produto.
Os valores próprios não serão alterados por mudanças no modelo.
Não será permitido sobrescrever individualmente um valor herdado.
O produto poderá ser analisado mesmo sem estar associado a um modelo.
5.3. Conflitos de nomes
Se houver conflito entre um item herdado do modelo e um item próprio do produto, a associação deverá ser bloqueada até que o usuário resolva o conflito.
O sistema deverá informar os itens conflitantes e permitir que o usuário renomeie ou remova os itens próprios envolvidos, conforme as regras de dependência.
Não resolva o conflito silenciosamente, não descarte dados automaticamente e não permita ambiguidades em fórmulas ou na tabela de análise.
5.4. Exclusão de modelos
Um modelo não poderá ser excluído enquanto houver produtos associados.
A interface deverá informar quais produtos impedem a exclusão.
O usuário deverá primeiro desassociar ou resolver as dependências. Não exclua produtos automaticamente como consequência da exclusão de um modelo.
5.5. Valores padrão
Campos numéricos: zero.
Campos textuais: vazios.
Campos de imagem: vazios.
A interface deverá distinguir visualmente um campo vazio de um campo numérico preenchido com zero, mesmo quando ambos forem tratados de forma semelhante em cálculos.
6. TIPOS DE DADOS E VALIDAÇÃO
6.1. Campos numéricos
Os campos numéricos deverão aceitar números inteiros e decimais.
Quando aplicável, permitir configurar:
Unidade de medida.
Quantidade de casas decimais para exibição.
Valor mínimo.
Valor máximo.
Validar os limites definidos e apresentar mensagens claras quando o valor for inválido.
Não confundir a precisão utilizada nos cálculos com a precisão de exibição.
6.2. Campos textuais
Os campos textuais poderão armazenar descrições, observações, links, contatos e outras informações.
Links deverão ser apresentados de maneira apropriada, com validação e abertura segura em nova aba quando aplicável.
Os itens textuais não deverão ser convertidos automaticamente em números para uso em fórmulas.
6.3. Campos de imagem
Armazene as imagens no Supabase Storage.
Armazene no banco somente as referências e os metadados necessários.
Redimensione as imagens para respeitar o limite máximo de 800 × 600 pixels, preservando a proporção.
Apresente miniaturas nas tabelas.
Permita abrir a imagem em uma visualização ampliada.
Implemente tratamento de falha de upload, exclusão e carregamento.
Proteja os arquivos por políticas de acesso compatíveis com a privacidade dos dados.
7. ITENS DE ANÁLISE BASEADOS EM FÓRMULAS
Um item de análise baseado em fórmula calcula um resultado a partir de itens numéricos de modelo, itens numéricos de produto e resultados de outros itens de análise.
A fórmula deverá ser executada de acordo com o contexto do registro analisado, respeitando a origem e a disponibilidade dos dados.
7.1. Editor de fórmulas
Disponibilize um editor de texto para a expressão, com recursos de auxílio para:
Inserir referências de itens por meio de uma lista.
Sugerir itens disponíveis.
Identificar referências inválidas.
Validar a sintaxe.
Exibir mensagens de erro compreensíveis.
Mostrar os itens utilizados pela fórmula.
A fórmula deverá referenciar identificadores internos estáveis, apresentando nomes legíveis no editor.
Não dependa exclusivamente de nomes de itens para resolver referências.
7.2. Operadores e funções permitidos
Implemente um conjunto controlado de operadores e funções, sem execução de código arbitrário.
Operadores aritméticos:
Adição (+).
Subtração (-).
Multiplicação (*).
Divisão (/).
Parênteses para agrupamento.
Operadores de comparação:
Igual a (=).
Diferente de (≠).
Menor que (<).
Maior que (>).
Menor ou igual a (≤).
Maior ou igual a (≥).
Operadores lógicos:
AND.
OR.
NOT.
Funções:
SUM(...): soma dos argumentos.
MIN(...): menor valor.
MAX(...): maior valor.
AVG(...): média aritmética.
ROUND(valor, casas): arredondamento para a quantidade de casas decimais indicada.
ABS(valor): valor absoluto.
COUNT(...): quantidade de argumentos com valor informado.
IF(condição, resultado_verdadeiro, resultado_falso): seleção condicional.
A gramática deverá definir a precedência dos operadores, os tipos de argumentos aceitos, o comportamento de cada função e as regras de avaliação lógica.
O COUNT deverá contar argumentos informados, incluindo zero, mas excluindo valores ausentes. Para os demais cálculos aritméticos, valores numéricos ausentes serão tratados como zero.
7.3. Valores ausentes
Quando uma fórmula referenciar um item numérico vazio ou inexistente no registro analisado, o valor utilizado na expressão será zero.
Essa regra aplica-se à avaliação de fórmulas. A ausência de dados em um critério de agregado terá tratamento diferente, conforme a seção de agregados.
7.4. Divisão por zero
A divisão por zero deverá produzir um erro de cálculo no item afetado.
Não substitua esse erro por zero.
Exiba uma mensagem contextual na célula ou no resultado correspondente.
Não interrompa o cálculo das demais linhas ou itens independentes.
Permita que o usuário corrija a fórmula ou os dados.
Não persista um resultado numérico fictício como se o cálculo tivesse sido bem-sucedido.
7.5. Validação e recálculo
Valide a fórmula ao salvar.
Valide a existência e a compatibilidade das referências.
Recalcule automaticamente os resultados exibidos quando os dados ou as fórmulas forem alterados.
Preserve o salvamento manual dos dados.
Exiba erros de sintaxe, referências inválidas e erros de execução de forma contextual.
Detecte dependências circulares entre itens de análise e impeça que sejam salvas.
Não permita que fórmulas executem JavaScript, SQL arbitrário ou qualquer outra linguagem de programação.
O mecanismo de cálculo deverá ser seguro, determinístico e testável.
8. ITENS DE ANÁLISE AGREGADOS
Um agregado combina critérios para produzir uma pontuação ponderada destinada à comparação e ao ranking.
Cada agregado deverá conter de 2 a 5 componentes, que poderão ser itens numéricos de modelo, itens numéricos de produto, itens de análise com resultados numéricos ou outros agregados.
Cada componente terá configurações próprias.
8.1. Peso dos componentes
Cada componente deverá possuir um peso inteiro entre 1 e 10.
O agregado também deverá possuir um peso inteiro entre 1 e 10 para utilização quando for incluído em outro agregado ou na configuração do ranking final.
Os pesos são relativos. Eles não representam porcentagens fixas e deverão ser normalizados pelo cálculo da média ponderada.
8.2. Direção de preferência
Cada inclusão de critério em um agregado deverá definir sua própria direção de preferência:
Maior é melhor: valores maiores devem resultar em pontuações normalizadas maiores.
Menor é melhor: valores menores devem resultar em pontuações normalizadas maiores.
A direção pertence à inclusão do critério no agregado, e não necessariamente ao item de origem. Assim, o mesmo item poderá ser utilizado com direções diferentes em agregados diferentes.
8.3. Normalização de critérios
Cada inclusão de critério deverá possuir limites configuráveis:
Limite inferior (Lmin).
Limite superior (Lmax).
Os limites deverão ser numéricos e diferentes entre si. O sistema deverá impedir o salvamento quando forem iguais.
A pontuação normalizada será calculada em uma escala de 0 a 10.
Para critérios em que maior é melhor:
pontuação = 10 × (valor − Lmin) / (Lmax − Lmin)
Para critérios em que menor é melhor:
pontuação = 10 × (Lmax − valor) / (Lmax − Lmin)
Após o cálculo, limite a pontuação ao intervalo de 0 a 10.
Valores abaixo ou acima dos limites deverão ser tratados por saturação: a pontuação será limitada ao extremo correspondente da escala.
Os limites de normalização deverão ser configuráveis por inclusão do critério, sem alterar o valor original do item.
8.4. Cálculo da média ponderada
Para os critérios válidos considerados no agregado, utilize:
pontuação do agregado = soma(peso × pontuação normalizada) / soma(pesos considerados)
Critérios sem dados válidos deverão ser excluídos do cálculo, e seus pesos não deverão fazer parte do denominador.
Quando um agregado estiver dentro de outro agregado, o resultado calculado do agregado filho será tratado como um componente numérico. A inclusão no agregado pai terá seu próprio peso e sua própria direção de preferência e configuração de normalização.
8.5. Dados insuficientes
Se nenhum critério válido puder ser considerado, o agregado deverá ficar indisponível, sem pontuação numérica válida e sem posição no ranking.
Não transforme esse estado em zero, pois zero é uma pontuação válida e representa uma situação diferente da ausência total de dados.
Quando somente parte dos critérios estiver disponível:
Calcule o agregado com os critérios válidos.
Renormalize os pesos considerados.
Exiba a cobertura dos critérios, por exemplo, “2 de 3 critérios considerados”.
8.6. Agregados aninhados
Permita que um agregado utilize outros agregados como componentes.
Detecte ciclos e impeça dependências circulares.
Recalcule os agregados dependentes quando seus componentes mudarem.
Preserve a configuração individual de peso, direção e normalização de cada inclusão.
Propague corretamente os estados de indisponibilidade e os erros.
Não trate um agregado indisponível como pontuação zero.
Não inclua no ranking uma pontuação final que dependa de um agregado inválido quando não houver critérios válidos suficientes.
8.7. Precisão
Mantenha precisão interna suficiente durante as operações.
Não arredonde os resultados intermediários de fórmulas, normalizações, médias ponderadas ou agregados aninhados. O arredondamento será aplicado somente à apresentação dos valores.
9. RANKING E COMPARAÇÃO
A tela de análise deverá oferecer classificação dos registros de acordo com critérios escolhidos pelo usuário.
9.1. Ranking por agregado
Permita selecionar explicitamente qual agregado determinará o ranking.
Exiba uma coluna com a posição no ranking.
Ordene a classificação pela pontuação interna calculada, em ordem decrescente.
Registros com pontuações exatamente iguais deverão ocupar a mesma posição.
Utilize classificação competitiva, por exemplo: 1º, 1º, 3º.
A igualdade deverá ser determinada pela precisão interna, não pelo valor arredondado apresentado na interface.
Registros com pontuação indisponível não receberão posição no ranking.
9.2. Ordenação geral
A ordenação das colunas deverá funcionar independentemente do ranking.
Permita:
Ordenação crescente ou decrescente.
Ordenação por múltiplas colunas.
Definição da prioridade entre critérios de ordenação.
Ordenação por itens numéricos, textuais e demais valores compatíveis.
A ordenação visual da tabela não deverá alterar a regra de cálculo do ranking.
10. SISTEMA DE FILTROS
Os filtros serão utilizados para mostrar ou ocultar linhas na tela de análise.
10.1. Condições
Permita criar filtros com uma ou várias condições.
Os operadores deverão incluir:
=
≠
<
>
≤
≥
Permita representar intervalos por meio de condições combinadas, como um preço entre dois limites.
As condições deverão ser validadas conforme o tipo de dado. Não aplique comparações numéricas a valores textuais sem uma regra explicitamente definida.
10.2. Lógica interna e global
Cada filtro poderá conter múltiplas condições conectadas por:
AND interno.
OR interno.
A tela de análise deverá possuir uma configuração global para combinar os filtros ativos por:
AND global.
OR global.
O resultado deverá respeitar os dois níveis de lógica.
Exemplo:
Filtro A: Preço < 500000 AND Quartos >= 3
Filtro B: Área >= 100
Se a combinação global for AND, um registro deverá satisfazer os dois filtros. Se for OR, deverá satisfazer pelo menos um deles.
A interface deverá deixar clara a lógica interna de cada filtro e a lógica global aplicada aos filtros ativos.
10.3. Persistência dos filtros
Os filtros salvos deverão ser reutilizáveis.
O usuário poderá ativar e desativar filtros na tela de análise.
Mudanças temporárias na análise não deverão modificar a definição dos filtros salvos.
Disponibilize uma tela específica para criar, editar e excluir filtros.
Verifique dependências antes de excluir itens referenciados por filtros.
A representação dos filtros deverá ser compreensível, permitindo ao usuário saber quais regras estão ativas e como elas estão combinadas.
11. TELA DE ANÁLISE
A tela de análise será o principal ambiente de comparação e deverá apresentar os modelos e produtos em uma tabela dinâmica.
11.1. Modos de visualização
Disponibilize os seguintes modos:
Somente modelos.
Somente produtos.
Modelos e produtos.
Somente itens de análise.
Quando modelos e produtos forem exibidos juntos, eles deverão aparecer como linhas independentes. Não duplique um modelo como se fosse um produto.
11.2. Colunas
Permita ao usuário:
Mostrar ou ocultar colunas.
Selecionar quais itens de modelo, itens de produto e itens de análise serão exibidos.
Reordenar as colunas.
Fixar colunas importantes.
Ajustar a largura das colunas.
Ordenar por uma ou várias colunas.
Visualizar o ranking quando aplicável.
As configurações de apresentação da análise deverão ser persistidas por escopo e compartilhadas entre as abas e sessões do mesmo usuário.
Os filtros ativos, as buscas textuais e demais critérios temporários de consulta não deverão alterar automaticamente as definições dos filtros salvos nem impor seu estado temporário às outras sessões.
11.3. Conteúdo das células
Textos longos deverão ser apresentados de maneira compacta, com acesso ao conteúdo completo.
Links deverão ser identificáveis e abrir em nova aba quando selecionados.
Imagens deverão aparecer em miniaturas.
O clique em uma miniatura deverá abrir uma visualização ampliada.
Valores numéricos deverão respeitar as configurações de apresentação.
Campos vazios deverão ser distinguíveis de zeros.
Erros de cálculo e agregados indisponíveis deverão ter representações visuais distintas.
A descrição de um item deverá estar disponível por meio de um mecanismo contextual, como tooltip, popover ou painel.
11.4. Pesquisa e carregamento
Carregue os dados necessários para a análise sem paginação convencional.
Implemente renderização virtualizada para manter o desempenho em tabelas grandes.
Disponibilize pesquisa textual rápida.
Implemente rolagem horizontal quando houver muitas colunas.
A renderização virtualizada não poderá limitar os dados usados na exportação.
11.5. Atualização em tempo real
Quando dados forem alterados em outra aba ou sessão, atualize automaticamente a análise.
A sincronização deverá respeitar alterações locais pendentes e o controle de versão dos registros.
12. TELAS E NAVEGAÇÃO
Implemente as seguintes áreas funcionais.
12.1. Dashboard
Lista de escopos recentes.
Acesso aos escopos existentes.
Criação de novo escopo.
Acesso rápido às principais funcionalidades.
12.2. Produtos
Listar produtos do escopo.
Criar, editar, duplicar e excluir produtos.
Associar ou desassociar modelos.
Editar itens próprios.
Visualizar os itens herdados separadamente dos itens próprios.
Informar conflitos de nomes e dependências.
12.3. Modelos
Listar modelos.
Criar, editar e duplicar modelos.
Associar itens de modelo.
Visualizar produtos associados.
Bloquear a exclusão quando existirem produtos associados.
12.4. Itens de modelo
Criar, consultar, editar e excluir itens de modelo.
Configurar tipo, descrição, unidade e restrições.
Verificar dependências antes de excluir.
Impedir alterações de tipo após a criação.
12.5. Itens de produto
Criar, consultar, editar e excluir itens próprios.
Configurar tipo, descrição, unidade e restrições.
Verificar dependências antes de excluir.
Impedir alterações de tipo após a criação.
12.6. Itens de análise
Listar itens de análise.
Criar e editar itens baseados em fórmulas.
Criar e editar agregados.
Visualizar dependências.
Validar fórmulas, limites, pesos e configurações.
Impedir exclusões que invalidem outros registros.
12.7. Análise
Comparar modelos e produtos.
Selecionar modos de visualização e colunas.
Pesquisar e aplicar filtros.
Ordenar dados.
Configurar e visualizar rankings.
Exportar CSV e PDF.
12.8. Filtros
Criar, editar e excluir filtros.
Definir condições.
Configurar AND/OR interno.
Visualizar dependências.
Permitir ativação e desativação na tela de análise.
12.9. Navegação geral
Utilize um menu lateral recolhível, adaptável ao dispositivo, com acesso às principais telas e à opção de sair da conta.
A navegação deverá preservar a clareza do escopo ativo e impedir que o usuário altere dados do escopo errado inadvertidamente.
13. SALVAMENTO, EDIÇÃO E SINCRONIZAÇÃO
O sistema utilizará salvamento manual dos dados.
13.1. Salvamento explícito
Disponibilize um botão “Salvar” nos formulários e fluxos de edição pertinentes.
Não persista silenciosamente alterações de dados apenas porque o usuário mudou de campo ou saiu de uma tela.
O botão deverá indicar estados de edição, salvamento, sucesso e erro.
Informe sucesso somente depois de o Supabase confirmar a operação.
Em caso de falha, preserve os dados digitados e ofereça uma forma segura de tentar novamente.
Recálculos automáticos na interface não deverão implicar salvamento automático dos dados editados.
13.2. Alterações pendentes
Se o usuário tentar sair de uma tela com alterações não salvas, ofereça:
Salvar.
Descartar.
Cancelar a saída.
Não descarte alterações sem decisão explícita do usuário.
13.3. Concorrência e controle de versão
Cada registro editável deverá ter um mecanismo de versão, como número de versão ou identificador de atualização.
Antes de salvar, verifique atomicamente se a versão persistida continua sendo a versão que o usuário editou.
Se outro processo tiver alterado o registro:
Bloqueie a gravação baseada na versão desatualizada.
Preserve as alterações locais.
Informe que o registro foi modificado em outra sessão.
Permita atualizar os dados e comparar as diferenças antes de reaplicar manualmente as alterações.
Não implemente esse controle apenas no frontend. A garantia deverá existir na operação de persistência.
13.4. Sincronização em tempo real
Utilize Supabase Realtime para receber atualizações pertinentes.
Atualize automaticamente os dados que não estejam sendo editados localmente.
Se houver alterações locais pendentes, preserve-as e avise sobre a atualização remota.
Não sobrescreva silenciosamente alterações locais com dados recebidos do servidor.
Trate desconexões, reconexões e erros de sincronização de maneira previsível.
14. EXCLUSÕES E INTEGRIDADE REFERENCIAL
As exclusões deverão respeitar as dependências entre entidades.
Quando uma exclusão for solicitada:
Identifique todas as dependências relevantes.
Se houver dependências impeditivas, bloqueie a exclusão.
Mostre ao usuário os registros que precisam ser resolvidos.
Se não houver impedimentos, solicite confirmação.
Execute a exclusão somente após a confirmação.
Não implemente lixeira nem recurso de desfazer exclusão.
Impeça a exclusão de itens utilizados por fórmulas, agregados, filtros, modelos ou outras configurações que ficariam inválidas.
Ao remover um item do modelo, verifique as referências de todos os produtos associados e as dependências analíticas.
A validação deverá ocorrer também no banco de dados, para evitar que operações concorrentes contornem as regras da interface.
15. BACKUP, EXPORTAÇÃO E IMPORTAÇÃO DE ESCOPOS
Implemente mecanismos de backup e restauração integral de escopos.
15.1. Backup
O backup deverá incluir todos os dados e configurações necessários para reconstruir o escopo, incluindo:
Modelos.
Produtos.
Itens de modelo.
Itens de produto.
Itens de análise.
Fórmulas.
Agregados e suas configurações.
Filtros salvos.
Configurações persistentes da análise.
Relacionamentos e referências internas.
Imagens e referências aos arquivos, conforme a estratégia de exportação adotada.
O formato deverá ser estruturado, versionado e documentado.
Não inclua segredos de autenticação ou credenciais administrativas.
15.2. Importação
Permita:
Importar um backup como um novo escopo.
Substituir um escopo existente por meio de um backup validado.
Antes de executar uma importação:
Verifique o formato e a versão do backup.
Valide a integridade dos registros.
Valide as referências e os relacionamentos.
Verifique nomes duplicados, tipos, fórmulas, dependências e configurações.
Verifique a presença e a integridade dos arquivos de imagem.
Apresente um resumo da operação.
A importação deverá ser atômica sempre que possível. Uma falha de validação ou execução não poderá deixar o escopo parcialmente substituído.
Quando forem gerados novos identificadores internos, preserve corretamente todas as referências entre os registros.
15.3. Exclusão de escopo
Antes de excluir um escopo:
Exija a criação de um backup.
Solicite uma confirmação reforçada.
Informe claramente que a operação excluirá os dados do escopo.
Verifique as dependências e a integridade da operação.
Exclua os dados e arquivos associados de acordo com uma estratégia segura.
Não informe que o backup foi realizado sem confirmação efetiva de sua conclusão.
16. EXPORTAÇÃO CSV
A tela de análise deverá permitir exportar os resultados em CSV.
O arquivo deverá:
Respeitar os filtros e a pesquisa aplicados à visualização atual.
Respeitar a seleção e a ordem das colunas.
Incluir todas as linhas correspondentes à consulta, inclusive as que não estejam renderizadas no momento pela tabela virtualizada.
Incluir os valores dos itens exibidos, os resultados de análise e as pontuações e posições de ranking quando disponíveis.
Utilizar delimitador vírgula.
Tratar corretamente aspas, quebras de linha e delimitadores presentes nos dados.
Utilizar codificação apropriada para preservar caracteres acentuados.
A exportação deverá refletir a consulta atual, sem limitar os resultados ao conteúdo visível no DOM.
17. RELATÓRIO PDF
Disponibilize a geração de um relatório PDF baseado na visualização atual da tela de análise.
O relatório deverá conter:
Nome do escopo.
Resumo da configuração da análise.
Filtros ativos e suas regras de combinação.
Colunas visíveis e ordenações aplicadas.
Data e hora da geração.
Tabela com os resultados filtrados.
Inclua pontuações dos agregados e posições no ranking quando disponíveis.
Não inclua gráficos. O PDF deverá conter tabelas legíveis, organizadas e bem formatadas.
Garanta que o relatório inclua todas as linhas da consulta atual, e não apenas as que estejam renderizadas pela tabela virtualizada.
Implemente tratamento de tabelas extensas, múltiplas páginas, larguras de colunas, quebras de texto e repetição de cabeçalhos quando necessário.
18. INTERFACE, DESIGN E ACESSIBILIDADE
Desenvolva uma interface moderna, profissional, consistente e funcional.
18.1. Tema
Utilize somente tema escuro.
Garanta contraste adequado entre textos, fundos, bordas, controles, mensagens e estados interativos.
Não dependa exclusivamente das cores para indicar erros, avisos, sucesso ou indisponibilidade.
18.2. Responsividade
A aplicação deverá funcionar em:
Computadores desktop.
Notebooks.
Tablets.
Celulares.
Em telas menores, adapte menus, formulários, painéis e tabelas.
Para tabelas largas, permita rolagem horizontal e mantenha os controles essenciais acessíveis.
18.3. Acessibilidade
Navegação por teclado.
Foco visível.
Rótulos associados aos campos.
Mensagens de erro claras.
Contraste adequado.
Estados de carregamento perceptíveis.
Diálogos e popovers utilizáveis por teclado.
Indicação textual dos estados de sucesso, erro e indisponibilidade.
18.4. Notificações e erros
Utilize notificações discretas para operações concluídas, avisos e falhas.
As mensagens deverão ser contextualizadas e orientar o usuário sobre como corrigir o problema.
Não apresente sucesso antes da confirmação da operação pelo backend.
Implemente tratamento de falhas de rede, autenticação, validação, concorrência, carregamento de imagens e geração de relatórios.
Disponibilize novas tentativas quando forem seguras, sem duplicar operações ou perder dados.
19. CONFIGURAÇÃO DO BANCO DE DADOS
Antes de implementar as migrações SQL, apresente o modelo de dados completo.
A proposta deverá identificar:
Entidades e seus propósitos.
Campos e tipos.
Chaves primárias.
Chaves estrangeiras.
Restrições de unicidade.
Restrições de valores e tipos.
Relacionamentos e cardinalidades.
Referências entre fórmulas e itens.
Estrutura dos agregados e suas inclusões.
Configuração de filtros.
Configurações persistentes de apresentação.
Controle de versão.
Estratégia para imagens.
Estratégia de exclusão.
Estratégia de backup e restauração.
Políticas RLS e de armazenamento.
Explique como cada regra de negócio será protegida no banco e como as operações concorrentes serão tratadas.
A modelagem deverá impedir referências órfãs, associações entre escopos indevidos e duplicidades incompatíveis com as regras de negócio.
Não coloque toda a lógica exclusivamente no frontend.
Após revisar e validar o modelo, implemente migrações SQL versionadas, políticas de segurança, índices e demais objetos necessários.
20. ESTRUTURA E QUALIDADE DO CÓDIGO
Organize o código em módulos com responsabilidades claras.
Separe, no mínimo:
Componentes visuais.
Páginas e navegação.
Formulários e validações.
Tipos e modelos de domínio.
Acesso ao Supabase.
Regras de negócio.
Avaliador de fórmulas.
Cálculos de normalização e agregação.
Lógica de ranking.
Filtros e ordenações.
Exportação CSV.
Geração de PDF.
Backup e importação.
Sincronização e controle de versão.
Testes.
Evite duplicação de regras entre componentes.
Implemente funções matemáticas e de domínio de modo que possam ser testadas sem depender da interface.
Use TypeScript com tipagem consistente. Evite o uso indiscriminado de any e não dependa de coerções silenciosas de tipos.
Não utilize dados fictícios como substitutos permanentes da integração real com o Supabase.
Não deixe funcionalidades importantes implementadas apenas como botões sem comportamento.
21. TESTES OBRIGATÓRIOS
Implemente testes unitários, de integração e de interface.
21.1. Testes unitários
Teste, no mínimo:
Avaliação de fórmulas válidas e inválidas.
Precedência dos operadores.
Funções permitidas.
Valores ausentes em fórmulas.
Divisão por zero.
Referências inválidas.
Detecção de ciclos.
Normalização de critérios.
Valores abaixo e acima dos limites.
Limites de normalização iguais.
Médias ponderadas.
Exclusão e renormalização de critérios ausentes.
Agregados sem critérios válidos.
Agregados aninhados.
Precisão interna.
Ranking com empates.
Combinação de filtros por AND e OR.
Regras de unicidade de nomes.
21.2. Testes de integração
Teste:
Autenticação.
Operações CRUD.
Relacionamentos entre escopos, modelos e produtos.
Herança dinâmica.
Inclusão e remoção de itens de modelo.
Bloqueio de associações com conflitos de nomes.
Bloqueio de exclusões com dependências.
Políticas RLS.
Políticas do Storage.
Salvamento manual.
Controle de versão e conflitos concorrentes.
Atualizações em tempo real.
Exportação e importação de backups.
Exportação CSV.
Geração de PDF.
21.3. Testes de interface
Teste os fluxos completos:
Primeiro acesso e criação de escopo.
Criação e edição de modelos.
Criação de produtos com e sem modelo.
Associação e desassociação de modelos.
Edição de itens próprios e herdados.
Criação de fórmulas.
Criação de agregados.
Aplicação de filtros.
Configuração e consulta do ranking.
Salvamento e descarte de alterações.
Tratamento de conflitos de sincronização.
Backup, importação e exclusão de escopo.
Exportação dos resultados.
Teste também cenários de erro, carregamento e navegação em dispositivos menores.
21.4. Testes de segurança
Comprove que um usuário não autenticado ou não autorizado não consegue acessar ou modificar dados privados por meio das APIs.
Verifique explicitamente as políticas RLS de todas as tabelas pertinentes e as políticas de acesso ao Storage.
Confirme que nenhuma chave administrativa está presente no código entregue ao navegador.
Não considere a segurança validada apenas porque as telas de acesso estão protegidas.
22. DEPLOYMENT E INTEGRAÇÃO CONTÍNUA
Configure o projeto para publicação no GitHub Pages.
Implemente GitHub Actions para executar, antes da publicação:
Instalação das dependências.
Verificação de tipos TypeScript.
Lint.
Testes unitários.
Testes de integração que possam ser executados com segurança no ambiente de CI.
Build de produção.
A publicação deverá ocorrer automaticamente quando as verificações obrigatórias forem aprovadas.
Se os testes falharem, o workflow deverá falhar e impedir a publicação daquela versão.
Configure corretamente o caminho-base do Vite para o GitHub Pages e trate o roteamento da aplicação para evitar erros de acesso direto às rotas.
Documente as variáveis de ambiente necessárias sem incluir segredos reais.
Não execute testes destrutivos contra dados de produção. Utilize um ambiente de teste apropriado para testes que alterem dados.
23. DOCUMENTAÇÃO E ENTREGÁVEIS
Entregue:
Código-fonte completo.
Projeto React, TypeScript e Vite configurado.
Migrações SQL versionadas.
Modelo de dados documentado.
Políticas RLS e de Storage.
Configuração do GitHub Pages.
Workflows do GitHub Actions.
Testes automatizados.
Arquivo de exemplo de variáveis de ambiente, sem segredos.
Instruções de instalação e execução local.
Instruções de configuração do Supabase.
Instruções de implantação.
Documentação do sistema de fórmulas.
Documentação das regras de normalização, agregação e ranking.
Documentação de backup e restauração.
Instruções de uso das principais funcionalidades.
Limitações técnicas conhecidas, se houver.
O projeto deverá ser compreensível e reproduzível por outro desenvolvedor, sem depender de informações não documentadas.
24. ORDEM DE EXECUÇÃO DO DESENVOLVIMENTO
Execute o projeto por etapas.
Etapa 1 — Levantamento e arquitetura
Organize os requisitos.
Identifique entidades, dependências e regras de negócio.
Apresente o modelo de dados proposto.
Apresente a arquitetura do frontend, banco, armazenamento e sincronização.
Identifique riscos e decisões técnicas relevantes.
Não gere as migrações SQL definitivas antes de concluir essa etapa.
Etapa 2 — Modelagem e segurança
Revise o modelo de dados.
Defina restrições, relacionamentos e controle de versão.
Defina as políticas RLS e do Storage.
Prepare as migrações SQL e os testes de segurança.
Etapa 3 — Estrutura da aplicação
Configure React, TypeScript e Vite.
Implemente autenticação.
Configure a integração com o Supabase.
Crie a navegação, o layout responsivo e o tema escuro.
Implemente os componentes e serviços compartilhados.
Etapa 4 — Funcionalidades de domínio
Implemente progressivamente:
Escopos.
Itens de modelo e modelos.
Itens de produto e produtos.
Herança dinâmica.
Fórmulas.
Agregados e normalização.
Ranking.
Filtros.
Tela de análise.
Exportações.
Backup e importação.
Mantenha as regras de dependência e integridade em todas as etapas.
Etapa 5 — Persistência e sincronização
Implemente salvamento manual.
Implemente detecção de alterações pendentes.
Implemente controle de versão.
Implemente atualizações em tempo real.
Teste conflitos de edição e recuperação de falhas.
Etapa 6 — Validação
Execute os testes unitários.
Execute os testes de integração.
Execute os testes de interface.
Verifique segurança e integridade.
Corrija as falhas encontradas.
Valide os fluxos completos com dados reais de teste.
Etapa 7 — Publicação e documentação
Configure a integração contínua.
Configure o deployment no GitHub Pages.
Valide a aplicação publicada.
Finalize a documentação.
Registre limitações conhecidas e procedimentos de recuperação.
Ao final de cada etapa, apresente um resumo do que foi concluído, os testes realizados, os resultados e as pendências. Não declare uma etapa concluída se seus requisitos ainda não tiverem sido implementados e validados.
25. CRITÉRIOS DE ACEITAÇÃO FINAL
O projeto somente poderá ser considerado concluído quando:
Todas as funcionalidades obrigatórias estiverem implementadas.
Os dados forem persistidos corretamente no Supabase.
O salvamento manual funcionar de forma confiável.
A herança entre modelos e produtos respeitar todas as regras.
Fórmulas, normalizações, agregados e rankings produzirem resultados corretos.
Agregados sem critérios válidos permanecerem indisponíveis e fora do ranking.
Os filtros internos e globais funcionarem corretamente.
Os conflitos de edição forem detectados e tratados sem perda silenciosa de dados.
As dependências impedirem exclusões indevidas.
Os backups puderem ser exportados, validados e restaurados.
CSV e PDF refletirem integralmente a consulta atual.
A aplicação funcionar nos dispositivos previstos.
As políticas de segurança tiverem sido verificadas.
Os testes obrigatórios tiverem sido executados e aprovados.
A implantação no GitHub Pages estiver funcional.
A documentação necessária estiver disponível.
Não existirem erros críticos conhecidos que comprometam o funcionamento, a segurança ou a integridade dos dados.
Não oculte funcionalidades incompletas. Não apresente resultados de testes que não foram executados. Informe claramente qualquer limitação que impeça o atendimento integral aos requisitos.
26. INSTRUÇÃO FINAL
Comece pela Etapa 1 — Levantamento e arquitetura.
Apresente o modelo de dados proposto, com entidades, campos essenciais, relacionamentos, restrições e dependências. Explique como as principais regras de negócio serão representadas e protegidas.
Aguarde a revisão do modelo de dados antes de gerar as migrações SQL definitivas.
Depois da validação da modelagem, prossiga com a implementação organizada por etapas, mantendo a integridade dos requisitos, a rastreabilidade das decisões, os testes e a documentação.
O objetivo final é entregar um DSS completo, seguro, confiável, responsivo, testado e pronto para uso real.
