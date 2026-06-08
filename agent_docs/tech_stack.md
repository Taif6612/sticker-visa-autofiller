# Tech Stack & Architectural Map

## Core Matrix
- **Platform:** Google Chrome Extension (Manifest V3)
- **UI Layer:** React + Vite (Popup context layout)
- **Logic Injections:** Vanilla JavaScript (Content Script layer)
- **Database Backend:** Supabase REST Engine (Serverless free tier integration)

## Framework State Override Pattern
To bypass Single Page Application (SPA) state constraints on modern forms, use the following native prototype hijacking pattern inside `content.js`:

```javascript
function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }
  
  // Enforce framework event updates
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}