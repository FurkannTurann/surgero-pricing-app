
/**
 * Loads a value from localStorage and parses it as JSON.
 * @param key - The key to retrieve.
 * @param fallback - The default value to return if the key is not found or parsing fails.
 * @returns The parsed value or the fallback.
 */
export const loadFromStorage = <T,>(key: string, fallback: T): T => {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (error) {
    console.error(`Error reading from localStorage key “${key}”:`, error);
    return fallback;
  }
};

/**
 * Saves a value to localStorage after converting it to a JSON string.
 * @param key - The key to save under.
 * @param value - The value to save.
 */
export const saveToStorage = <T,>(key: string, value: T): void => {
  try {
    const item = JSON.stringify(value);
    window.localStorage.setItem(key, item);
  } catch (error) {
    console.error(`Error writing to localStorage key “${key}”:`, error);
  }
};

/**
 * Removes an item from localStorage.
 * @param key - The key to remove.
 */
export const removeFromStorage = (key: string): void => {
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        console.error(`Error removing from localStorage key "${key}":`, error);
    }
}
   