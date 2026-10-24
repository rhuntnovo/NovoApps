import { createRoot } from 'react-dom/client';
import {AccessBoundary} from './Access';
import { App } from './App';
import './styles.css';
createRoot(document.getElementById('root')!).render(<AccessBoundary>{access=><App access={access}/>}</AccessBoundary>);
