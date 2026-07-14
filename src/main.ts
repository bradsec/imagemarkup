import './style.css';
import { startApp } from './controller';

const app = document.querySelector<HTMLDivElement>('#app')!;
startApp(app);
