import { createContext } from 'react';

// React context crosses portals; CSS inheritance does not. Only the authenticated
// operations shell opts its dialogs into the light workspace presentation.
export const OperationsDialogContext = createContext(false);
