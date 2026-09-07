import { createRoot } from 'react-dom/client';
import { AttackLibrary } from './AttackLibrary';
import './scrollbars.css';

document.body.classList.add('attack-library-window');
createRoot(document.getElementById('root')!).render(
  <AttackLibrary onClose={() => window.bossAPI.closeAttackLibrary()} />,
);
