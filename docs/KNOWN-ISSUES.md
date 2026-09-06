# Problemas conhecidos

## Áudio: stutter ainda presente — 2.0.0-beta.3

Em 06/09/2026, Brian confirmou que ainda percebe microcortes/stutter nos sons e na música, apesar das correções de pré-carregamento, transferência do player e redução temporária de volume. A versão beta.3 é autorizada com essa limitação conhecida; o problema **não está resolvido**.

A investigação foi adiada explicitamente pelo usuário. Ao retomá-la, reproduzir com os arquivos reais do encontro, registrar a saída de áudio e comparar aplicativo Electron e navegadores, incluindo a transição cutscene → fase. Separar atrasos de transporte/decodificação, agendamento, loops e eventuais silêncios dos arquivos. Os testes automatizados atuais de transporte e ganho não substituem a confirmação auditiva do usuário.

## Firefox no ambiente local

A combinação local Windows/Node 24/Playwright mantém uma limitação ambiental registrada. A matriz local validada usa Chromium, Chrome e Edge; isso não equivale a uma validação local do Firefox.
