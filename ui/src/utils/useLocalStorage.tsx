import { Dispatch, SetStateAction, useEffect, useState } from "react";

function getStorageValue<S>(key: string, defaultValue: S): S {
    // getting stored value
    const saved = localStorage.getItem(key);
    const initial = saved && JSON.parse(saved);
    return initial || defaultValue;
}
function useLocalStorage<S>(key: string, defaultValue: S): [S, Dispatch<SetStateAction<S>>] {
    const [value, setValue] = useState<S>(() => {
        return getStorageValue(key, defaultValue);
    });

    useEffect(() => {
        // storing input name
        localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);

    return [value, setValue];
};

export default useLocalStorage