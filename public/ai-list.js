function createAiError(code, status, detail) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.detail = detail;
  return error;
}

async function generateList({ prompt, authToken, appCheckToken, listNames, currentListName, currentListItems }) {
  if (!authToken) throw createAiError('AI_AUTH_REQUIRED');
  if (!appCheckToken) throw createAiError('AI_DEVICE_NOT_VERIFIED');

  const safePrompt = String(prompt || '').trim().slice(0, 600);

  let response;
  try {
    response = await fetch('/api/ai/generate-list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': appCheckToken,
      },
      body: JSON.stringify({
        prompt: safePrompt,
        listNames: Array.isArray(listNames) ? listNames : [],
        currentListName: currentListName || undefined,
        currentListItems: Array.isArray(currentListItems) ? currentListItems : [],
      }),
    });
  } catch (error) {
    throw createAiError('AI_NETWORK', 0, error && error.message);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw createAiError(payload.code || 'AI_TEMPORARY_ERROR', response.status, payload.detail);
  }

  return payload.result;
}

window.GetGoListAI = Object.freeze({ generateList });
