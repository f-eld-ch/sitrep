import { getDefaultValues } from '@apollo/client/utilities';
import React from 'react';
const IncidentContext = React.createContext<String>("6796c0d0-ddfa-4d81-870b-121200723e0c");
const JournalContext = React.createContext<String>("f4cce005-6c24-4923-8549-f1fba6bd806a");

export {
    JournalContext,
    IncidentContext,
}