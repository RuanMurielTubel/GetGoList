    let lists = {};
    let currentListName = "Lista 1";
    let selectedDivideListName = "";
    let shoppingList = [];
    let listHistory = [];
    let editingIndex = null;
    let hasShownLowBalanceAlert = false;
    let allSelected = false;
    let isMenuOpen = false;
    let charts = {};
    let collapsedSectors = new Set();
    let sectorsDefaultedCollapsed = new Set();
    let quickAddSector = null;
    let firebaseAuth = null;
    let firestoreDb = null;
    let firebaseStorage = null;
    let firebaseAppCheck = null;
    let currentFirebaseUser = null;
    let remoteListReference = null;
    let remoteListUnsubscribe = null;
    let sharedListId = null;
    let remoteSyncReady = false;
    let applyingRemoteLists = false;
    let remoteSaveTimer = null;
    let initialRemoteSnapshotHandled = false;
    let lastSharedListsSnapshot = null;
    let pendingShareDocumentReference = null;
    let currentSharedOwnerId = null;
    let sharedListEnded = false;
    let currentSharedParticipantEmails = [];
    let sharedParticipantRegistered = false;
    let finishingSharing = false;
    let allowEndedSharedDivision = false;
    let aiSuggestedItems = [];
    let lastAiGenerationAt = 0;
    let knownSharedLists = [];
    let currentSubscription = null;
    let subscriptionUnsubscribe = null;
    let checkoutReturnPending = false;

    // O bridge nativo do Capacitor injeta window.Capacitor antes dos
    // scripts da página rodarem — só existe dentro do app Android, nunca
    // no navegador. Usado pra manter o menu fixo (sempre aberto) na web e
    // recolhível como hoje só dentro do app.
    const isNativeAppShell = typeof window.Capacitor !== 'undefined'
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform();

    const firebaseConfig = {
      apiKey: "AIzaSyAFj6YWQfz3dI2motK3qH9xc0UNVF7TzqY",
      authDomain: "getgolist.firebaseapp.com",
      projectId: "getgolist",
      storageBucket: "getgolist.firebasestorage.app",
      appId: "1:448077185241:web:f6b41684c7c34d12ecbec8"
    };
    const recaptchaSiteKey = "6Lf_8nEtAAAAACSA6bpk3s2s9raecd6-iGqIiyxI";
    const MAX_LISTS = 50;
    const MAX_ITEMS_PER_LIST = 500;
    const MAX_HISTORY_PER_LIST = 1000;
    const MAX_SECTORS_PER_LIST = 50;
    const MAX_SECTOR_NAME_LENGTH = 60;
    const CREATE_SECTOR_OPTION_VALUE = '__create_sector__';

    // MANTER EM SINCRONIA COM src/lib/shared/plan-limits.ts E
    // firestore.rules (maxListsForPlan/canShareForPlan). Verificado por
    // tests/plan-limits-sync.test.mjs.
    const PLAN_LIMITS = {
      free:   { maxLists: 1,  canShare: false, hasAI: false, hasGestao: false, showAds: true },
      cesta:  { maxLists: 10, canShare: true,  hasAI: false, hasGestao: false, showAds: true },
      cestao: { maxLists: Infinity, canShare: true, hasAI: true, hasGestao: true, showAds: false },
    };
    // Contas que sempre têm Cestão e nunca são cobradas — decisão manual,
    // não uma assinatura paga. Mesma lista em src/lib/shared/plan-limits.ts
    // (COMPLIMENTARY_CESTAO_EMAILS) e em firestore.rules.
    const COMPLIMENTARY_CESTAO_EMAILS = ['gabrielamoraesn@gmail.com', 'tubel.mendes@gmail.com'];
    function isComplimentaryCestaoAccount() {
      const email = currentFirebaseUser && currentFirebaseUser.email
        ? currentFirebaseUser.email.trim().toLowerCase()
        : '';
      return COMPLIMENTARY_CESTAO_EMAILS.includes(email);
    }

    function currentEffectivePlanId() {
      if (isComplimentaryCestaoAccount()) return 'cestao';
      const plan = currentSubscription && currentSubscription.plan;
      return plan === 'cesta' || plan === 'cestao' ? plan : 'free';
    }

    function currentPlanLimits() {
      return PLAN_LIMITS[currentEffectivePlanId()];
    }

    // O script do AdSense já carrega direto pelo <head> de public/index.html
    // (obrigatório pra verificação de propriedade do site). Aqui só resta
    // pedir os anúncios pra cada espaço, uma vez, quando o plano permitir.
    const ADSENSE_PUBLISHER_ID = 'ca-pub-8312406358027338';
    let adsInitialized = false;

    function initializeAds() {
      if (adsInitialized || !ADSENSE_PUBLISHER_ID) {
        return;
      }
      adsInitialized = true;
      document.querySelectorAll('.ad-slot .adsbygoogle').forEach(() => {
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
          console.warn('Não foi possível carregar um anúncio.', error);
        }
      });
    }

    function updateAdVisibility() {
      const showAds = currentPlanLimits().showAds;
      document.querySelectorAll('.ad-slot').forEach((slot) => {
        slot.classList.toggle('ad-slot-hidden', !showAds);
      });
      if (showAds) {
        initializeAds();
      }
    }

    const predefinedSectors = [
      'Geral',
      'Limpeza',
      'Higiene Pessoal',
      'Padaria',
      'Hortifruti',
      'Açougue',
      'Bebidas',
      'Congelados'
    ];

    function cleanText(value, maximumLength, fallback = '') {
      const text = typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : fallback;
      return text.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maximumLength) || fallback;
    }

    function boundedNumber(value, minimum, maximum, fallback = 0) {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.min(maximum, Math.max(minimum, number));
    }

    const ITEM_UNITS = ['un', 'kg', 'L'];
    function normalizeItemUnit(value) {
      return ITEM_UNITS.includes(value) ? value : 'un';
    }
    function boundedQuantity(value, unit) {
      const allowDecimal = unit === 'kg' || unit === 'L';
      const bounded = boundedNumber(value, allowDecimal ? 0.01 : 1, 10000, 1);
      return allowDecimal ? Math.round(bounded * 100) / 100 : Math.round(bounded);
    }
    function formatItemQuantity(quantity, unit) {
      const normalizedUnit = normalizeItemUnit(unit);
      if (normalizedUnit === 'un') return String(Math.round(quantity));
      const trimmed = quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return `${trimmed.replace('.', ',')} ${normalizedUnit}`;
    }

    // Kg/L aceitam quantidade fracionada (2,5 kg); "un" continua inteiro,
    // já que não existe "2,5 unidades" de um produto contado.
    function updateItemUnitStep(quantityInput, unit) {
      if (!quantityInput) return;
      const allowDecimal = unit === 'kg' || unit === 'L';
      quantityInput.step = allowDecimal ? '0.01' : '1';
      quantityInput.min = allowDecimal ? '0.01' : '1';
    }

    function safeListName(value, fallback = 'Lista') {
      return cleanText(value, 80, fallback);
    }

    function normalizeSectorName(value, fallback = '') {
      return cleanText(value, MAX_SECTOR_NAME_LENGTH, fallback)
        .replace(/\s+/g, ' ')
        .trim();
    }

    function uniqueSectorNames(values, maximum = MAX_SECTORS_PER_LIST) {
      const names = [];
      const normalizedKeys = new Set();
      (Array.isArray(values) ? values : []).forEach((value) => {
        const name = normalizeSectorName(value);
        const key = name.toLocaleLowerCase('pt-BR');
        if (!name || normalizedKeys.has(key) || names.length >= maximum) return;
        normalizedKeys.add(key);
        names.push(name);
      });
      return names;
    }

    function isSafeImageSource(value) {
      if (typeof value !== 'string') return false;
      // Prévia local (FileReader) de uma foto já validada em até 5 MB —
      // em base64 isso vira uma string de até ~7 MB de caracteres, bem
      // além do limite de 4096 usado abaixo pra URLs normais. Esse limite
      // maior é só pra essa prévia local; não vem de fonte externa.
      if (/^data:image\/(png|jpeg);base64,/i.test(value)) {
        return value.length <= 7 * 1024 * 1024;
      }
      if (value.length > 4096) return false;
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    }

    function setAvatarContent(container, photoURL, initialsText, includeInitialsId = false) {
      container.replaceChildren();
      if (isSafeImageSource(photoURL)) {
        const image = document.createElement('img');
        image.src = photoURL;
        image.alt = 'Avatar do perfil';
        image.referrerPolicy = 'no-referrer';
        container.appendChild(image);
        return;
      }
      const initials = document.createElement('span');
      if (includeInitialsId) initials.id = 'profileInitials';
      initials.textContent = cleanText(initialsText, 2, 'G');
      container.appendChild(initials);
    }

    function firebaseUserPhotoURL(user) {
      if (!user) return '';
      const providers = Array.isArray(user.providerData) ? user.providerData : [];
      const googleProfile = providers.find((provider) =>
        provider && provider.providerId === 'google.com' && isSafeImageSource(provider.photoURL)
      );
      if (googleProfile) return googleProfile.photoURL;
      return isSafeImageSource(user.photoURL) ? user.photoURL : '';
    }

    async function getFirebaseAppCheckToken() {
      if (!firebaseAppCheck) {
        throw new Error('Proteção do aplicativo indisponível. Recarregue a página.');
      }
      const result = await firebaseAppCheck.getToken(false);
      if (!result || !result.token) {
        throw new Error('Não foi possível validar este dispositivo.');
      }
      return result.token;
    }

    async function waitForAuthenticatedUser(timeoutMs = 5000) {
      if (currentFirebaseUser) return currentFirebaseUser;
      if (!firebaseAuth) return null;
      if (firebaseAuth.currentUser) {
        currentFirebaseUser = firebaseAuth.currentUser;
        return currentFirebaseUser;
      }

      return new Promise((resolve) => {
        let finished = false;
        let unsubscribe = () => {};
        const finish = (user) => {
          if (finished) return;
          finished = true;
          window.clearTimeout(timeoutId);
          unsubscribe();
          if (user) currentFirebaseUser = user;
          resolve(user || null);
        };
        const timeoutId = window.setTimeout(() => finish(firebaseAuth.currentUser), timeoutMs);
        unsubscribe = firebaseAuth.onAuthStateChanged(
          (user) => finish(user),
          () => finish(null),
        );
      });
    }

    function cloneSerializable(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function createEntityId(prefix = 'item') {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return `${prefix}-${window.crypto.randomUUID()}`;
      }
      return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function localStorageListsKey() {
      // Isolado por UID quando autenticado: sem isso, o cache local de
      // listas particulares (usado pra funcionar offline e pra preservar
      // edições feitas antes do primeiro sincronismo) era uma única chave
      // global do navegador — trocar de conta no mesmo navegador podia
      // mostrar, e até mesclar de volta na nuvem, listas de outra conta.
      return currentFirebaseUser ? `lists:${currentFirebaseUser.uid}` : 'lists';
    }

    function saveLists(options = {}) {
      try {
        localStorage.setItem(localStorageListsKey(), JSON.stringify(lists));
      } catch (error) {
        console.error("Não foi possível salvar as listas neste dispositivo.", error);
      }

      if (
        options.localOnly ||
        applyingRemoteLists ||
        !remoteSyncReady ||
        !currentFirebaseUser ||
        !remoteListReference
      ) {
        return;
      }

      const listsPayload = sharedListId
        ? { [currentListName]: cloneSerializable(lists[currentListName]) }
        : cloneSerializable(lists);
      const payload = {
        lists: listsPayload,
        currentListName,
        lastEditedBy: currentFirebaseUser
          ? cleanText(currentFirebaseUser.displayName || currentFirebaseUser.email, 80, 'Usuário GetGoList')
          : 'Anônimo',
        lastEditedByEmail: currentFirebaseUser ? cleanText(currentFirebaseUser.email, 254) : '',
        lastEditedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      window.clearTimeout(remoteSaveTimer);
      remoteSaveTimer = window.setTimeout(() => {
        // Em listas compartilhadas, update substitui o mapa `lists` inteiro.
        // Usar set(..., { merge: true }) preservava chaves removidas no
        // Firestore e fazia listas excluídas reaparecerem no próximo snapshot.
        const remoteSave = sharedListId
          ? saveSharedListsTransaction(payload)
          : remoteListReference.set(payload);

        remoteSave.catch((error) => {
          console.error("Não foi possível sincronizar as listas.", error);
          updateAccountPanel("Conta conectada • sincronização pendente");
        });
      }, 350);
    }

    function updateAccountPanel(statusMessage) {
      const status = document.getElementById('accountSyncStatus');
      const email = document.getElementById('accountEmail');
      const action = document.getElementById('accountAction');

      if (!email || !action) {
        return;
      }

      const navButtons = document.querySelectorAll('.sidebar > button');
      const sidebarGreeting = document.getElementById('sidebarGreeting');

      if (currentFirebaseUser) {
        status.textContent = statusMessage || "Conta conectada • sincronizado";
        email.textContent = currentFirebaseUser.email || "Conta GetGoList";
        action.textContent = "Desconectar";
        action.title = "Desconectar";
        action.setAttribute('aria-label', 'Desconectar');
        navButtons.forEach((button) => {
          button.style.display = 'flex';
        });
        if (sidebarGreeting) {
          sidebarGreeting.style.display = 'block';
        }
      } else {
        status.textContent = "Modo visitante";
        email.textContent = "Listas salvas neste dispositivo";
        action.textContent = "Entrar e sincronizar";
        action.title = "Entrar e sincronizar";
        action.setAttribute('aria-label', 'Entrar e sincronizar');
        navButtons.forEach((button) => {
          button.style.display = 'none';
        });
        if (sidebarGreeting) {
          sidebarGreeting.style.display = 'none';
        }
      }
      updateProfileSection();
    }

    function handleAccountAction() {
      if (currentFirebaseUser && firebaseAuth) {
        firebaseAuth.signOut().catch(() => {
          updateAccountPanel("Não foi possível sair. Tente novamente.");
        });
        return;
      }

      window.location.href = '/login';
    }

    function updateProfileSection() {
      const nameElement = document.getElementById('profileName');
      const emailElement = document.getElementById('profileEmail');
      const statusElement = document.getElementById('profileStatus');
      const displayNameInput = document.getElementById('displayNameInput');
      const profileBioInput = document.getElementById('profileBioInput');
      const avatar = document.getElementById('profileAvatar');
      const sidebarName = document.getElementById('sidebarName');
      const sidebarAvatar = document.getElementById('sidebarAvatar');

      if (!nameElement || !emailElement || !statusElement || !displayNameInput || !profileBioInput || !avatar || !sidebarName || !sidebarAvatar) {
        return;
      }

      const localProfileData = loadLocalProfileData();

      if (currentFirebaseUser) {
          const displayName = localProfileData.displayName || currentFirebaseUser.displayName || currentFirebaseUser.email || 'Usuário GetGoList';
        const photoURL = localProfileData.photoDataUrl || firebaseUserPhotoURL(currentFirebaseUser);
        const emailValue = currentFirebaseUser.email || 'Sem email';

        nameElement.textContent = displayName;
        emailElement.textContent = emailValue;
        statusElement.textContent = 'Conta conectada • perfil disponível';
        displayNameInput.value = localProfileData.displayName || currentFirebaseUser.displayName || '';
        profileBioInput.value = localProfileData.bio || '';

        const welcomeGreeting = document.getElementById('welcomeGreeting');
        const sidebarGreeting = document.getElementById('sidebarGreeting');
        if (welcomeGreeting) {
          welcomeGreeting.textContent = `Olá, ${displayName}`;
        }
        if (sidebarGreeting) {
          sidebarGreeting.textContent = `Olá, ${displayName}`;
        }
        sidebarName.textContent = displayName;

        const initialsText = displayName
          .split(' ')
          .filter(Boolean)
          .map((word) => word[0].toUpperCase())
          .slice(0, 2)
          .join('') || 'G';
        setAvatarContent(avatar, photoURL, initialsText, true);
        setAvatarContent(sidebarAvatar, photoURL, initialsText);
      } else {
        const displayName = localProfileData.displayName || 'Visitante';
        const photoURL = localProfileData.photoDataUrl || '';

        nameElement.textContent = displayName;
        emailElement.textContent = 'Listas salvas neste dispositivo';
        statusElement.textContent = 'Entre para ativar o perfil';
        displayNameInput.value = localProfileData.displayName || '';
        profileBioInput.value = localProfileData.bio || '';
        sidebarName.textContent = displayName;

        const initialsText = displayName
          .split(' ')
          .filter(Boolean)
          .map((word) => word[0].toUpperCase())
          .slice(0, 2)
          .join('') || 'G';
        setAvatarContent(avatar, photoURL, initialsText, true);
        setAvatarContent(sidebarAvatar, photoURL, initialsText);

        const welcomeGreeting = document.getElementById('welcomeGreeting');
        const sidebarGreeting = document.getElementById('sidebarGreeting');
        if (welcomeGreeting) {
          welcomeGreeting.textContent = `Olá, ${displayName}`;
        }
        if (sidebarGreeting) {
          sidebarGreeting.textContent = `Olá, ${displayName}`;
        }
        updateProfileStats();
      }
    }

    function saveProfileEdits() {
      const displayNameInput = document.getElementById('displayNameInput');
      const profileBioInput = document.getElementById('profileBioInput');

      if (!displayNameInput || !profileBioInput) {
        return;
      }

      const displayName = cleanText(displayNameInput.value, 80);
      const bio = cleanText(profileBioInput.value, 300);

      if (!displayName && !bio) {
        alert('Informe um nome ou uma bio para atualizar.');
        return;
      }

      const localProfileData = loadLocalProfileData();
      const profileOverrides = {
        displayName: displayName || localProfileData.displayName || '',
        photoDataUrl: localProfileData.photoDataUrl || '',
        bio: bio || localProfileData.bio || ''
      };
      saveLocalProfileData(profileOverrides);

      if (!currentFirebaseUser || !firebaseAuth) {
        updateProfileSection();
        alert('Perfil atualizado localmente. Faça login para sincronizar com o perfil remoto.');
        return;
      }

      const updates = {};
      if (displayName) {
        updates.displayName = displayName;
      }

      const finish = () => {
        updateProfileSection();
        updateAccountPanel('Conta conectada • perfil atualizado');
        alert('Perfil atualizado com sucesso!');
      };

      if (Object.keys(updates).length === 0) {
        finish();
        return;
      }

      currentFirebaseUser.updateProfile(updates)
        .then(() => {
          finish();
        })
        .catch((error) => {
          console.error('Erro ao atualizar perfil:', error);
          finish();
          alert('Perfil atualizado localmente, mas não foi possível atualizar o perfil remoto.');
        });
    }

    function uploadProfilePhoto(file) {
      if (!firebaseStorage || !currentFirebaseUser) {
        return;
      }

      const extension = file.type === 'image/png' ? 'png' : 'jpg';
      const storagePath = `profilePhotos/${currentFirebaseUser.uid}.${extension}`;
      const storageRef = firebaseStorage.ref(storagePath);

      updateAccountPanel('Enviando foto de perfil...');
      const uploadTask = storageRef.put(file);

      uploadTask.on(
        'state_changed',
        null,
        (error) => {
          console.error('Erro ao enviar foto de perfil:', error);
          updateAccountPanel('Erro ao enviar foto. Tente novamente.');
          alert('Não foi possível enviar a foto de perfil.');
        },
        () => {
          uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
            const currentData = loadLocalProfileData();
            saveLocalProfileData({
              ...currentData,
              photoDataUrl: downloadURL
            });
            currentFirebaseUser.updateProfile({ photoURL: downloadURL })
              .then(() => {
                updateProfileSection();
                updateAccountPanel('Conta conectada • perfil atualizado');
                alert('Foto de perfil salva e persistida com sucesso.');
              })
              .catch((error) => {
                console.error('Erro ao atualizar foto no perfil Firebase:', error);
                updateProfileSection();
                updateAccountPanel('Conta conectada • perfil atualizado localmente');
              });
          });
        }
      );
    }

    function loadCurrentProfile() {
      updateProfileSection();
    }

    function promptPhotoEdit() {
      // Foto de perfil personalizada depende do Firebase Storage, que
      // ainda não foi ativado (exige o plano Blaze). Enquanto isso, o
      // avatar mostra as iniciais ou a foto do Google, quando houver.
      alert('O envio de foto de perfil personalizada está temporariamente indisponível. Em breve!');
    }

    function handlePhotoFileSelect(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      if (!file.type.match('image/(jpeg|png)')) {
        alert('Por favor selecione um arquivo PNG ou JPEG.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('A foto deve ter no máximo 5 MB.');
        event.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataURL = reader.result;
        const currentData = loadLocalProfileData();

        saveLocalProfileData({
          ...currentData,
          photoDataUrl: typeof dataURL === 'string' ? dataURL : currentData.photoDataUrl
        });
        updateProfileSection();
      };

      reader.readAsDataURL(file);

      if (currentFirebaseUser && firebaseStorage) {
        uploadProfilePhoto(file);
      }
    }

    function updateProfileStats() {
      const totalListsCount = Object.keys(lists).length;
      const totalItemsCount = Object.values(lists).reduce((sum, list) => sum + list.history.length, 0);
      const totalSpent = Object.values(lists).reduce((sum, list) =>
        sum + list.history.reduce((listSum, item) => listSum + item.total, 0), 0);

      const totalLists = document.getElementById('profileTotalLists');
      const totalItems = document.getElementById('profileTotalItems');
      const totalSpentEl = document.getElementById('profileTotalSpent');

      if (totalLists) totalLists.textContent = totalListsCount;
      if (totalItems) totalItems.textContent = totalItemsCount;
      if (totalSpentEl) totalSpentEl.textContent = `R$ ${totalSpent.toFixed(2).replace('.', ',')}`;
    }

    function profileDataStorageKey() {
      // Isolado por UID quando autenticado: sem isso, o nome/bio/foto de
      // uma conta anterior no mesmo navegador vazava (e podia ser
      // sobrescrito de volta) pra próxima conta que logasse ali.
      return currentFirebaseUser ? `profileData:${currentFirebaseUser.uid}` : 'profileData';
    }

    function loadLocalProfileData() {
      try {
        const raw = localStorage.getItem(profileDataStorageKey());
        return raw ? JSON.parse(raw) : { displayName: '', photoDataUrl: '', bio: '' };
      } catch {
        return { displayName: '', photoDataUrl: '', bio: '' };
      }
    }

    function saveLocalProfileData(data) {
      try {
        localStorage.setItem(profileDataStorageKey(), JSON.stringify(data));
      } catch (error) {
        console.error('Erro ao salvar dados de perfil localmente:', error);
      }
    }

    function legacyEntityId(prefix, entity, index) {
      const source = [
        prefix,
        index,
        entity && entity.name,
        entity && entity.price,
        entity && entity.quantity,
        entity && entity.date,
      ].join('|');
      let hash = 0;
      for (let position = 0; position < source.length; position += 1) {
        hash = ((hash << 5) - hash + source.charCodeAt(position)) | 0;
      }
      return `${prefix}-legacy-${Math.abs(hash)}`;
    }

    function normalizeListData(listData) {
      if (!listData || typeof listData !== 'object') {
        return { items: [], history: [], balance: 0, initialBalance: 0 };
      }

      const normalizedItems = Array.isArray(listData.items)
        ? listData.items.slice(0, MAX_ITEMS_PER_LIST).map((item, index) => {
            const sanitizedItem = item && typeof item === 'object' ? item : {};
            const price = boundedNumber(sanitizedItem.price, 0, 100000000, 0);
            const unit = normalizeItemUnit(sanitizedItem.unit);
            const quantity = boundedQuantity(sanitizedItem.quantity, unit);
            return {
              id: cleanText(sanitizedItem.id, 100, legacyEntityId('item', sanitizedItem, index)),
              name: cleanText(sanitizedItem.name, 120, 'Item'),
              price,
              quantity,
              unit,
              total: price * quantity,
              sector: normalizeSectorName(sanitizedItem.sector, 'Geral'),
              date: cleanText(sanitizedItem.date, 20, new Date().toLocaleDateString()),
              checked: Boolean(sanitizedItem.checked),
            };
          })
        : [];

      const normalizedHistory = Array.isArray(listData.history)
        ? listData.history.slice(0, MAX_HISTORY_PER_LIST).map((entry, index) => {
            const sanitizedEntry = entry && typeof entry === 'object' ? entry : {};
            const price = boundedNumber(sanitizedEntry.price, 0, 100000000, 0);
            const unit = normalizeItemUnit(sanitizedEntry.unit);
            const quantity = boundedQuantity(sanitizedEntry.quantity, unit);
            return {
              id: cleanText(sanitizedEntry.id, 100, legacyEntityId('history', sanitizedEntry, index)),
              name: cleanText(sanitizedEntry.name, 120, 'Item'),
              price,
              quantity,
              unit,
              total: price * quantity,
              sector: normalizeSectorName(sanitizedEntry.sector, 'Geral'),
              date: cleanText(sanitizedEntry.date, 20, new Date().toLocaleDateString()),
              checked: Boolean(sanitizedEntry.checked),
            };
          })
        : [];

      return {
        items: normalizedItems,
        history: normalizedHistory,
        sectorOrder: Array.isArray(listData.sectorOrder)
          ? uniqueSectorNames(listData.sectorOrder)
          : [],
        balance: boundedNumber(listData.balance, -1000000000, 1000000000, 0),
        initialBalance: boundedNumber(listData.initialBalance, 0, 1000000000, 0),
      };
    }

    function mergeSharedCollection(remoteEntries, baselineEntries, desiredEntries) {
      const remoteMap = new Map((remoteEntries || []).map((entry) => [entry.id, entry]));
      const baselineMap = new Map((baselineEntries || []).map((entry) => [entry.id, entry]));
      const desiredMap = new Map((desiredEntries || []).map((entry) => [entry.id, entry]));

      baselineMap.forEach((entry, id) => {
        if (!desiredMap.has(id)) {
          remoteMap.delete(id);
        }
      });

      desiredMap.forEach((entry, id) => {
        const baselineEntry = baselineMap.get(id);
        if (!baselineEntry || JSON.stringify(entry) !== JSON.stringify(baselineEntry)) {
          remoteMap.set(id, entry);
        }
      });

      const desiredOrder = (desiredEntries || []).map((entry) => entry.id);
      const remainingIds = Array.from(remoteMap.keys()).filter((id) => !desiredOrder.includes(id));
      return [...desiredOrder, ...remainingIds]
        .filter((id) => remoteMap.has(id))
        .map((id) => remoteMap.get(id));
    }

    function mergeSharedListData(remoteList, baselineList, desiredList) {
      const remote = normalizeListData(remoteList);
      const baseline = normalizeListData(baselineList);
      const desired = normalizeListData(desiredList);
      const mergedItems = mergeSharedCollection(remote.items, baseline.items, desired.items);
      const mergedHistory = mergeSharedCollection(remote.history, baseline.history, desired.history);
      const initialBalanceChanged = desired.initialBalance !== baseline.initialBalance;
      const initialBalance = initialBalanceChanged ? desired.initialBalance : remote.initialBalance;
      const sectorOrderChanged = JSON.stringify(desired.sectorOrder) !== JSON.stringify(baseline.sectorOrder);
      const desiredSectorKeys = new Set(desired.sectorOrder.map((sector) => sector.toLocaleLowerCase('pt-BR')));
      const removedSectorKeys = new Set(
        baseline.sectorOrder
          .filter((sector) => !desiredSectorKeys.has(sector.toLocaleLowerCase('pt-BR')))
          .map((sector) => sector.toLocaleLowerCase('pt-BR'))
      );
      const sectorOrder = sectorOrderChanged
        ? uniqueSectorNames([
            ...desired.sectorOrder,
            ...remote.sectorOrder.filter((sector) => !removedSectorKeys.has(sector.toLocaleLowerCase('pt-BR'))),
          ])
        : remote.sectorOrder;
      const moveRemovedSectorToGeneral = (entry) =>
        removedSectorKeys.has(normalizeSectorName(entry.sector, 'Geral').toLocaleLowerCase('pt-BR'))
          ? { ...entry, sector: 'Geral' }
          : entry;
      const items = mergedItems.map(moveRemovedSectorToGeneral);
      const history = mergedHistory.map(moveRemovedSectorToGeneral);

      return {
        items,
        history,
        sectorOrder,
        initialBalance,
        balance: initialBalance - items.reduce((sum, item) => sum + item.total, 0),
      };
    }

    function saveSharedListsTransaction(payload) {
      if (!firestoreDb || !remoteListReference) {
        return Promise.reject(new Error('Sincronização compartilhada indisponível.'));
      }

      const desiredListName = payload.currentListName;
      const desiredList = payload.lists[desiredListName];
      const baselineLists = lastSharedListsSnapshot || {};
      const baselineListName = Object.keys(baselineLists)[0] || desiredListName;
      const baselineList = baselineLists[baselineListName] || desiredList;

      return firestoreDb.runTransaction((transaction) => {
        return transaction.get(remoteListReference).then((snapshot) => {
          if (!snapshot.exists) {
            throw new Error('A lista compartilhada não existe mais.');
          }

          const remoteData = snapshot.data() || {};
          const remoteLists = remoteData.lists || {};
          const remoteList = remoteLists[desiredListName]
            || remoteLists[Object.keys(remoteLists)[0]]
            || desiredList;
          const mergedList = mergeSharedListData(remoteList, baselineList, desiredList);

          transaction.update(remoteListReference, {
            lists: { [desiredListName]: mergedList },
            currentListName: desiredListName,
            lastEditedBy: payload.lastEditedBy,
            lastEditedByEmail: payload.lastEditedByEmail,
            lastEditedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        });
      });
    }

    function hasListData(listData) {
      if (!listData || typeof listData !== 'object') {
        return false;
      }

      return (
        (Array.isArray(listData.items) && listData.items.length > 0) ||
        (Array.isArray(listData.history) && listData.history.length > 0) ||
        (typeof listData.balance === 'number' && listData.balance !== 0) ||
        (typeof listData.initialBalance === 'number' && listData.initialBalance !== 0)
      );
    }

    function mergeLocalAndRemoteLists(remoteLists, localLists) {
      const mergedLists = {};
      const allListNames = new Set([
        ...Object.keys(remoteLists || {}),
        ...Object.keys(localLists || {})
      ]);

      allListNames.forEach((listName) => {
        const remoteList = remoteLists && remoteLists[listName];
        const localList = localLists && localLists[listName];

        if (remoteList && localList) {
          const remoteHasData = hasListData(remoteList);
          const localHasData = hasListData(localList);

          mergedLists[listName] = remoteHasData || !localHasData
            ? normalizeListData(remoteList)
            : normalizeListData(localList);
          return;
        }

        mergedLists[listName] = normalizeListData(remoteList || localList);
      });

      return mergedLists;
    }

    function clearLocalCache() {
      try {
        localStorage.removeItem(localStorageListsKey());
        console.log('Cache local de listas limpo');
      } catch (error) {
        console.error('Não foi possível limpar o cache local:', error);
      }
    }

    function applyRemoteLists(remoteLists, preferredListName) {
      if (!remoteLists || typeof remoteLists !== 'object' || !Object.keys(remoteLists).length) {
        return;
      }

      applyingRemoteLists = true;
      lists = Object.fromEntries(
        Object.entries(remoteLists).slice(0, MAX_LISTS).map(([listName, listData]) => [
          safeListName(listName),
          normalizeListData(listData),
        ])
      );
      if (sharedListId) {
        lastSharedListsSnapshot = cloneSerializable(lists);
      }
      currentListName =
        preferredListName && lists[preferredListName]
          ? preferredListName
          : Object.keys(lists)[0];
      shoppingList = lists[currentListName].items || [];
      listHistory = lists[currentListName].history || [];
      if (sharedListId && !sharedListEnded) {
        rememberSharedListAccess(currentListName, sharedListId);
      }
      // Uma lista compartilhada não deve substituir o cache das listas
      // particulares do usuário no dispositivo.
      if (!sharedListId) {
        clearLocalCache();
        saveLists({ localOnly: true });
      }

      setupListButtons();
      updateList();
      updateHistory();
      updateFooter();
      updateDashboard();
      updateTargetListSelect();
      updateDivideListSelect();
      updateMonthSelect();
      updateSharedModeUi();
      applyingRemoteLists = false;
    }

    function recentSharedListStorageKey() {
      // Isolado por UID: sem isso, trocar de conta no mesmo navegador fazia
      // a conta nova herdar (e até acessar) a lista compartilhada da conta
      // anterior, já que localStorage não é isolado por conta sozinho.
      return currentFirebaseUser ? `recentSharedList:${currentFirebaseUser.uid}` : null;
    }

    function rememberSharedListAccess(listName, documentId) {
      if (!listName || !documentId) {
        return;
      }
      const storageKey = recentSharedListStorageKey();
      if (!storageKey) {
        return;
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          id: documentId,
          name: listName,
        }));
      } catch (error) {
        console.warn('Não foi possível guardar o atalho da lista compartilhada.', error);
      }
    }

    function getRecentSharedList() {
      const storageKey = recentSharedListStorageKey();
      if (!storageKey) {
        return null;
      }
      try {
        const recent = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (recent && typeof recent.id === 'string' && recent.id && typeof recent.name === 'string' && recent.name) {
          return recent;
        }
      } catch (error) {
        console.warn('O atalho da lista compartilhada está inválido.', error);
      }
      return null;
    }

    function clearRememberedSharedList(documentId) {
      const storageKey = recentSharedListStorageKey();
      try {
        const recent = getRecentSharedList();
        if (storageKey && (!documentId || !recent || recent.id === documentId)) {
          localStorage.removeItem(storageKey);
        }
      } catch (error) {
        console.warn('Não foi possível remover o atalho da lista compartilhada.', error);
      }

      const recentSharedBanner = document.getElementById('recentSharedBanner');
      const recentSharedListName = document.getElementById('recentSharedListName');
      if (recentSharedBanner) recentSharedBanner.style.display = 'none';
      if (recentSharedListName) recentSharedListName.textContent = '';
    }

    function clearRememberedSharedListByName(listName) {
      const recent = getRecentSharedList();
      if (recent && recent.name === listName) {
        clearRememberedSharedList(recent.id);
      }
    }

    function openPrivateLists() {
      window.location.assign('/index.html');
    }

    function openRecentSharedList() {
      const recentSharedList = getRecentSharedList();
      if (recentSharedList) {
        window.location.assign(`/index.html?sharedList=${encodeURIComponent(recentSharedList.id)}`);
      }
    }

    async function syncSharedListsForAccount() {
      if (!currentFirebaseUser || sharedListId) {
        return;
      }

      try {
        const [token, appCheckToken] = await Promise.all([
          currentFirebaseUser.getIdToken(),
          getFirebaseAppCheckToken(),
        ]);
        const response = await fetch('/api/shared-list/mine', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Firebase-AppCheck': appCheckToken,
          },
        });
        if (!response.ok) {
          throw new Error('Não foi possível consultar as listas compartilhadas.');
        }

        const result = await response.json();
        const accountSharedLists = Array.isArray(result.lists) ? result.lists : [];
        const recentSharedList = accountSharedLists.find((list) =>
          list && typeof list.id === 'string' && list.id && typeof list.name === 'string' && list.name
        );

        if (recentSharedList) {
          rememberSharedListAccess(recentSharedList.name, recentSharedList.id);
        } else {
          clearRememberedSharedList();
        }
        knownSharedLists = accountSharedLists;
        updateSharedModeUi();
        renderHomeLists();
      } catch (error) {
        console.warn('Não foi possível sincronizar os atalhos compartilhados da conta.', error);
      }
    }

    function isSharedGuest() {
      // Colaborador numa lista compartilhada (não o dono): só pode
      // incluir/remover/editar produtos, não controla orçamento, nome
      // da lista nem finaliza o compartilhamento.
      return Boolean(sharedListId) && (!currentFirebaseUser || currentSharedOwnerId !== currentFirebaseUser.uid);
    }

    function updateSharedModeUi() {
      const sharedBanner = document.getElementById('sharedModeBanner');
      const sharedListName = document.getElementById('sharedModeListName');
      const sharedModeTitle = document.getElementById('sharedModeTitle');
      const sharedModeDescription = document.getElementById('sharedModeDescription');
      const finishSharingButton = document.getElementById('finishSharingButton');
      const recentSharedBanner = document.getElementById('recentSharedBanner');
      const recentSharedListName = document.getElementById('recentSharedListName');
      const recentSharedList = getRecentSharedList();
      const activeSectionId = document.querySelector('.section.active')?.id || '';
      const showSharedContext = activeSectionId === 'shoppingSection' || activeSectionId === 'productsSection';
      const moveSelectedItemsButton = document.getElementById('moveSelectedListItemsButton');
      const listManagementIds = [
        'openCreateListDialogButton',
        'openEditListNamesDialogButton',
        'openDeleteListDialogButton',
        'openDivideListButton',
      ];

      if (sharedBanner) {
        sharedBanner.style.display = showSharedContext && sharedListId && !sharedListEnded ? 'flex' : 'none';
      }
      if (sharedListName) {
        sharedListName.textContent = currentListName;
      }
      if (sharedModeTitle) {
        sharedModeTitle.textContent = sharedListEnded ? 'Compartilhamento encerrado' : 'Colaboração em tempo real';
      }
      if (sharedModeDescription) {
        sharedModeDescription.innerHTML = sharedListEnded
          ? `A lista “<span id="sharedModeListName"></span>” agora está acessível apenas para você.`
          : `Você está editando “<span id="sharedModeListName"></span>” com outros colaboradores.`;
        const updatedSharedListName = document.getElementById('sharedModeListName');
        if (updatedSharedListName) updatedSharedListName.textContent = currentListName;
      }
      if (finishSharingButton) {
        const isOwner = currentFirebaseUser && currentSharedOwnerId === currentFirebaseUser.uid;
        finishSharingButton.style.display = sharedListId && isOwner && !sharedListEnded ? '' : 'none';
      }
      if (recentSharedBanner) {
        recentSharedBanner.style.display = showSharedContext && !sharedListId && recentSharedList ? 'flex' : 'none';
      }
      if (recentSharedListName && recentSharedList) {
        recentSharedListName.textContent = recentSharedList.name;
      }
      if (moveSelectedItemsButton) {
        moveSelectedItemsButton.style.display = sharedListId ? 'none' : '';
      }
      listManagementIds.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.style.display = sharedListId ? 'none' : '';
        }
      });
      const budgetButton = document.getElementById('openBudgetDialogButton');
      if (budgetButton) {
        budgetButton.style.display = isSharedGuest() ? 'none' : '';
      }
    }

    async function registerSharedListParticipant() {
      if (!sharedListId || !currentFirebaseUser || sharedParticipantRegistered || sharedListEnded) {
        return;
      }

      sharedParticipantRegistered = true;
      try {
        const [token, appCheckToken] = await Promise.all([
          currentFirebaseUser.getIdToken(),
          getFirebaseAppCheckToken(),
        ]);
        const response = await fetch('/api/shared-list/access', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Firebase-AppCheck': appCheckToken,
          },
          body: JSON.stringify({ listId: sharedListId }),
        });
        if (!response.ok) {
          throw new Error('Não foi possível registrar o acesso à lista.');
        }
      } catch (error) {
        sharedParticipantRegistered = false;
        console.warn('Não foi possível registrar o colaborador da lista.', error);
      }
    }

    function subscribeToRemoteLists() {
      if (!remoteListReference) {
        return;
      }
      if (remoteListUnsubscribe) {
        remoteListUnsubscribe();
      }

      remoteListUnsubscribe = remoteListReference.onSnapshot((snapshot) => {
        const remoteData = snapshot.exists ? snapshot.data() : null;
        if (sharedListId && !snapshot.exists) {
          clearRememberedSharedList(sharedListId);
          remoteSyncReady = false;
          if (!finishingSharing) {
            window.location.replace('/index.html');
          }
          return;
        }
        if (sharedListId && remoteData) {
          currentSharedOwnerId = remoteData.owner || null;
          sharedListEnded = remoteData.sharingEnded === true;
          if (sharedListEnded) {
            clearRememberedSharedList(sharedListId);
            if (!finishingSharing && !allowEndedSharedDivision) {
              window.location.replace('/index.html');
              return;
            }
          }
          currentSharedParticipantEmails = Array.isArray(remoteData.participantEmails)
            ? remoteData.participantEmails
                .map((email) => typeof email === 'string' ? email.trim().toLowerCase() : '')
                .filter((email, index, collection) => email && collection.indexOf(email) === index)
            : [];
          registerSharedListParticipant();
        }

        if (remoteData && remoteData.lists && Object.keys(remoteData.lists).length) {
          if (sharedListId) {
            const sharedName = remoteData.currentListName && remoteData.lists[remoteData.currentListName]
              ? remoteData.currentListName
              : Object.keys(remoteData.lists)[0];
            applyRemoteLists({ [sharedName]: remoteData.lists[sharedName] }, sharedName);
            initialRemoteSnapshotHandled = true;
            remoteSyncReady = true;
          } else if (!initialRemoteSnapshotHandled) {
            const mergedLists = mergeLocalAndRemoteLists(remoteData.lists, lists);
            applyRemoteLists(mergedLists, remoteData.currentListName);
            initialRemoteSnapshotHandled = true;
            remoteSyncReady = true;
            saveLists();
          } else {
            applyRemoteLists(remoteData.lists, remoteData.currentListName);
            remoteSyncReady = true;
          }
        } else if (sharedListId) {
          remoteSyncReady = false;
          updateAccountPanel('Lista compartilhada indisponível');
        } else {
          initialRemoteSnapshotHandled = true;
          remoteSyncReady = true;
          saveLists();
        }

        const lastEditorName = remoteData && (remoteData.lastEditedBy || remoteData.lastEditedByEmail);
        updateLastEditedInfo(lastEditorName);
        if (remoteSyncReady) {
          updateAccountPanel(sharedListId
            ? (sharedListEnded ? 'Conta conectada • compartilhamento encerrado' : 'Conta conectada • colaboração em tempo real')
            : undefined);
        }
        updateDivisionParticipants();
      }, (error) => {
        console.error('Não foi possível acompanhar a lista em tempo real.', error);
        remoteSyncReady = false;
        if (sharedListId && error && error.code === 'permission-denied') {
          clearRememberedSharedList(sharedListId);
          alert('O compartilhamento desta lista foi finalizado pelo proprietário.');
          window.location.replace('/index.html');
          return;
        }
        updateAccountPanel(sharedListId ? 'Sem acesso a esta lista compartilhada' : 'Conta conectada • sincronização pendente');
      });
    }

    function subscribeToSubscriptionStatus() {
      if (subscriptionUnsubscribe) {
        subscriptionUnsubscribe();
        subscriptionUnsubscribe = null;
      }
      if (!currentFirebaseUser || !firestoreDb) {
        return;
      }
      subscriptionUnsubscribe = firestoreDb
        .collection('users')
        .doc(currentFirebaseUser.uid)
        .collection('billing')
        .doc('subscription')
        .onSnapshot((snapshot) => {
          currentSubscription = snapshot.exists ? snapshot.data() : null;
          updatePlanUi();
        }, (error) => {
          console.error('Não foi possível acompanhar o plano da conta.', error);
        });
    }

    const PLAN_NAMES = { free: 'Free', cesta: 'Cesta', cestao: 'Cestão' };

    function updatePlanUi() {
      const limits = currentPlanLimits();
      updateAdVisibility();
      const managementButton = document.querySelector('.management-button');
      const shareButton = document.querySelector('.share-button');
      if (managementButton) {
        managementButton.style.display = limits.hasGestao ? '' : 'none';
      }
      if (shareButton) {
        shareButton.style.display = limits.canShare ? '' : 'none';
      }

      const aiListCreator = document.getElementById('aiListForm');
      const aiLockedBanner = document.getElementById('aiLockedBanner');
      const aiListPrompt = document.getElementById('aiListPrompt');
      const generateAiListButton = document.getElementById('generateAiListButton');
      if (aiListCreator) {
        aiListCreator.classList.toggle('ai-locked', !limits.hasAI);
      }
      if (aiLockedBanner) {
        aiLockedBanner.hidden = limits.hasAI;
      }
      if (aiListPrompt) {
        aiListPrompt.disabled = !limits.hasAI;
      }
      if (generateAiListButton) {
        generateAiListButton.disabled = !limits.hasAI;
      }

      const plan = currentEffectivePlanId();
      const isComplimentary = isComplimentaryCestaoAccount();
      const badge = document.getElementById('planBadge');
      const statusText = document.getElementById('planStatusText');
      const usageText = document.getElementById('planUsageText');
      const upgradeButton = document.getElementById('planUpgradeButton');
      const cancelButton = document.getElementById('planCancelButton');

      if (badge) {
        badge.textContent = PLAN_NAMES[plan] || 'Free';
      }
      if (statusText) {
        if (isComplimentary) {
          statusText.textContent = 'Cestão cortesia — acesso completo, nunca cobrado.';
        } else if (currentSubscription && currentSubscription.cancelAtPeriodEnd) {
          statusText.textContent = 'Assinatura cancelada — benefícios ativos até o fim do período já pago.';
        } else if (currentSubscription && currentSubscription.pendingPlan) {
          const pendingName = PLAN_NAMES[currentSubscription.pendingPlan] || currentSubscription.pendingPlan;
          statusText.textContent = `Aguardando confirmação do pagamento do plano ${pendingName}.`;
        } else if (plan === 'free') {
          statusText.textContent = 'Plano gratuito ativo.';
        } else {
          statusText.textContent = 'Assinatura ativa.';
        }
      }
      if (usageText) {
        const listCount = Object.keys(lists).length;
        usageText.textContent = Number.isFinite(limits.maxLists)
          ? `${listCount} de ${limits.maxLists} listas usadas`
          : `${listCount} listas (ilimitado)`;
      }
      if (upgradeButton) {
        upgradeButton.style.display = isComplimentary ? 'none' : '';
        upgradeButton.textContent = plan === 'free' ? 'Ver planos' : 'Trocar de plano';
      }
      if (cancelButton) {
        const hasPaidPlan = plan !== 'free';
        const alreadyCancelling = Boolean(currentSubscription && currentSubscription.cancelAtPeriodEnd);
        cancelButton.style.display = !isComplimentary && hasPaidPlan && !alreadyCancelling ? '' : 'none';
      }
    }

    async function loadPaymentHistory() {
      const list = document.getElementById('planPaymentHistoryList');
      if (!list || !currentFirebaseUser) {
        return;
      }
      try {
        const [token, appCheckToken] = await Promise.all([
          currentFirebaseUser.getIdToken(),
          getFirebaseAppCheckToken(),
        ]);
        const response = await fetch('/api/billing/status', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Firebase-AppCheck': appCheckToken,
          },
        });
        if (!response.ok) return;
        const result = await response.json();
        const payments = Array.isArray(result.payments) ? result.payments : [];
        if (!payments.length) {
          list.innerHTML = '<li class="plan-payment-empty">Nenhum pagamento registrado ainda.</li>';
          return;
        }
        list.innerHTML = '';
        payments.forEach((payment) => {
          const item = document.createElement('li');
          const amount = document.createElement('span');
          amount.textContent = `R$ ${(payment.amountCents / 100).toFixed(2).replace('.', ',')}`;
          const status = document.createElement('span');
          status.textContent = payment.status || '';
          item.append(amount, status);
          list.appendChild(item);
        });
      } catch (error) {
        console.error('Não foi possível carregar o histórico de pagamentos.', error);
      }
    }

    async function handleCancelSubscription() {
      if (!currentFirebaseUser) return;
      if (!confirm('Deseja cancelar sua assinatura? Os benefícios do plano pago continuam até o fim do período já pago.')) {
        return;
      }
      const cancelButton = document.getElementById('planCancelButton');
      if (cancelButton) cancelButton.disabled = true;
      try {
        const [token, appCheckToken] = await Promise.all([
          currentFirebaseUser.getIdToken(),
          getFirebaseAppCheckToken(),
        ]);
        const response = await fetch('/api/billing/cancel', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Firebase-AppCheck': appCheckToken,
          },
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error('CANCEL_FAILED');
        alert('Assinatura cancelada. Os benefícios ficam ativos até o fim do período já pago.');
      } catch (error) {
        console.error('Não foi possível cancelar a assinatura.', error);
        alert('Não foi possível cancelar agora. Tente novamente.');
      } finally {
        if (cancelButton) cancelButton.disabled = false;
      }
    }

    async function handleDeleteAccount() {
      if (!currentFirebaseUser) return;
      if (!confirm('Excluir sua conta é permanente: suas listas, assinatura e histórico de pagamentos serão apagados e não podem ser recuperados. Listas que você compartilhou continuam acessíveis para os demais colaboradores, sem o seu controle. Deseja continuar?')) {
        return;
      }
      const deleteButton = document.getElementById('deleteAccountButton');
      if (deleteButton) {
        deleteButton.disabled = true;
        deleteButton.textContent = 'Excluindo...';
      }
      try {
        const [token, appCheckToken] = await Promise.all([
          currentFirebaseUser.getIdToken(),
          getFirebaseAppCheckToken(),
        ]);
        const response = await fetch('/api/account/delete', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Firebase-AppCheck': appCheckToken,
          },
        });
        if (!response.ok) throw new Error('DELETE_FAILED');
        await firebaseAuth.signOut();
        window.location.href = '/login?deleted=1';
      } catch (error) {
        console.error('Não foi possível excluir a conta.', error);
        alert('Não foi possível excluir sua conta agora. Tente novamente em instantes.');
        if (deleteButton) {
          deleteButton.disabled = false;
          deleteButton.textContent = 'Excluir conta';
        }
      }
    }

    function activateSharedList(docRef, documentId, initialLists) {
      remoteListReference = docRef;
      sharedListId = documentId;
      initialRemoteSnapshotHandled = true;
      remoteSyncReady = true;
      lastSharedListsSnapshot = cloneSerializable(initialLists);
      const sharedName = Object.keys(initialLists || {})[0];
      if (sharedName) {
        rememberSharedListAccess(sharedName, documentId);
      }
      const sharedUrl = `${window.location.origin}${window.location.pathname}?sharedList=${documentId}`;
      window.history.replaceState({}, document.title, sharedUrl);
      updateSharedModeUi();
      subscribeToRemoteLists();
      updateAccountPanel('Conta conectada • colaboração em tempo real');
      return sharedUrl;
    }

    function initializeFirebaseSync() {
      if (typeof firebase === 'undefined') {
        updateAccountPanel("Sincronização indisponível");
        return;
      }

      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }

        firebaseAuth = firebase.auth();
        firestoreDb = firebase.firestore();
        firebaseStorage = firebase.storage();
        firebaseAppCheck = firebase.appCheck();
        firebaseAppCheck.activate(recaptchaSiteKey, true);
        firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {
          // O app continua funcionando com cache em memória.
        });

        firebaseAuth.onAuthStateChanged((user) => {
          if (user && !user.emailVerified) {
            const redirectUrl = `${window.location.pathname}${window.location.search}`;
            window.location.replace(`/login?verify=1&redirect=${encodeURIComponent(redirectUrl)}`);
            return;
          }
          currentFirebaseUser = user;
          loadListsFromLocalCache();
          remoteSyncReady = false;
          initialRemoteSnapshotHandled = false;
          sharedParticipantRegistered = false;
          currentSharedParticipantEmails = [];

          if (remoteListUnsubscribe) {
            remoteListUnsubscribe();
            remoteListUnsubscribe = null;
          }
          if (subscriptionUnsubscribe) {
            subscriptionUnsubscribe();
            subscriptionUnsubscribe = null;
          }
          currentSubscription = null;

          if (!user) {
            remoteListReference = null;
            if (sharedListId) {
              updateAccountPanel('Entre para participar da lista compartilhada');
              const redirectUrl = `${window.location.pathname}${window.location.search}`;
              window.location.replace(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
              return;
            }

            updateAccountPanel();
            const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
            if (currentPath === '/' || currentPath.endsWith('/index.html')) {
              const redirectUrl = `${window.location.pathname}${window.location.search}`;
              window.location.replace(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
            }
            return;
          }

          if (sharedListId) {
            updateAccountPanel('Conta conectada • lista compartilhada');
            remoteListReference = firestoreDb.collection('sharedLists').doc(sharedListId);
          } else {
            updateAccountPanel('Conta conectada • sincronizando');
            remoteListReference = firestoreDb
              .collection('users')
              .doc(user.uid)
              .collection('appData')
              .doc('lists');
          }
          showSection(checkoutReturnPending ? 'profileSection' : (sharedListId ? 'productsSection' : 'homeSection'));
          if (checkoutReturnPending) {
            checkoutReturnPending = false;
            updateAccountPanel('Conta conectada • confirmando seu pagamento…');
          }
          updateSharedModeUi();
          subscribeToRemoteLists();
          subscribeToSubscriptionStatus();
          syncSharedListsForAccount();
        });
      } catch (error) {
        console.error("Não foi possível iniciar a sincronização.", error);
        updateAccountPanel("Sincronização indisponível");
      }
    }

    function updateLastEditedInfo(lastEditorName) {
      const lastEditedElement = document.getElementById('lastEditedBy');
      if (!lastEditedElement) {
        return;
      }
      if (lastEditorName) {
        lastEditedElement.textContent = `Última alteração: ${lastEditorName}`;
      } else {
        lastEditedElement.textContent = 'Última alteração: não registrada';
      }
    }

    function initializeLists() {
      // Descobre o modo compartilhado antes de qualquer outra coisa. Antes,
      // essa informação era lida tarde demais e as listas particulares
      // acabavam sendo copiadas para o documento compartilhado.
      const urlParams = new URLSearchParams(window.location.search);
      sharedListId = urlParams.get('sharedList');
      if (sharedListId && !/^[A-Za-z0-9]{20}$/.test(sharedListId)) {
        sharedListId = null;
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      checkoutReturnPending = urlParams.get('checkout') === 'return';
      if (checkoutReturnPending) {
        window.history.replaceState({}, document.title, `${window.location.pathname}?section=profileSection`);
      }

      // Não lê nenhum cache local aqui: antes de saber qual conta (se
      // alguma) está autenticada neste navegador, carregar o cache
      // compartilhado do dispositivo podia mostrar por um instante — e,
      // pior, mesclar de volta na nuvem — listas de uma conta diferente
      // que usou este mesmo navegador antes. loadListsFromLocalCache()
      // cuida disso assim que o estado de autenticação é conhecido.
      lists = { "Lista 1": { items: [], history: [], balance: 0, initialBalance: 0 } };
      currentListName = "Lista 1";
      shoppingList = lists[currentListName].items;
      listHistory = lists[currentListName].history;

      updateFooter();
      updateDashboard();
      updateTargetListSelect();
      populateSectorSelect();
    }

    function loadListsFromLocalCache() {
      if (sharedListId) {
        return;
      }

      let storedLists = null;
      try {
        const storedData = localStorage.getItem(localStorageListsKey());
        if (storedData) {
          storedLists = JSON.parse(storedData);
        }
      } catch (e) {
        console.error("Erro ao parsear o cache local de listas:", e);
      }

      if (!storedLists || typeof storedLists !== 'object' || !Object.keys(storedLists).length) {
        return;
      }

      lists = {};
      Object.keys(storedLists).slice(0, MAX_LISTS).forEach(listName => {
        lists[safeListName(listName)] = normalizeListData(storedLists[listName]);
      });

      currentListName = Object.keys(lists)[0] || "Lista 1";
      if (!lists[currentListName]) {
        lists[currentListName] = { items: [], history: [], balance: 0, initialBalance: 0 };
      }
      shoppingList = lists[currentListName].items;
      listHistory = lists[currentListName].history;

      updateFooter();
      updateDashboard();
      updateTargetListSelect();
      populateSectorSelect();

    }

    function updateDashboard() {
      updateStats();
      updateCharts();
      renderHomeLists();
    }

    function setAiListStatus(message = '', isError = false) {
      const status = document.getElementById('aiListStatus');
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('is-error', Boolean(isError));
    }

    function normalizedAiSuggestion(suggestion) {
      const source = suggestion && typeof suggestion === 'object' ? suggestion : {};
      const seenItems = new Set();
      const items = (Array.isArray(source.items) ? source.items : [])
        .slice(0, 80)
        .map((item) => {
          const itemSource = item && typeof item === 'object' ? item : {};
          const unit = normalizeItemUnit(itemSource.unit);
          return {
            name: cleanText(itemSource.name, 120),
            quantity: boundedQuantity(itemSource.quantity, unit),
            unit,
            sector: normalizeSectorName(itemSource.sector, 'Geral'),
          };
        })
        .filter((item) => {
          const itemKey = `${item.name.toLocaleLowerCase('pt-BR')}|${item.sector.toLocaleLowerCase('pt-BR')}`;
          if (!item.name || seenItems.has(itemKey)) return false;
          seenItems.add(itemKey);
          return true;
        });

      return {
        listName: safeListName(source.listName, 'Lista inteligente'),
        items,
      };
    }

    function renderAiListPreview(suggestion) {
      const preview = document.getElementById('aiListPreview');
      const nameInput = document.getElementById('aiPreviewListName');
      const budgetInput = document.getElementById('aiPreviewBudget');
      const itemsContainer = document.getElementById('aiPreviewItems');
      const itemCount = document.getElementById('aiPreviewItemCount');
      if (!preview || !nameInput || !budgetInput || !itemsContainer || !itemCount) return;

      aiSuggestedItems = suggestion.items.slice();
      nameInput.value = suggestion.listName;
      budgetInput.value = '';
      itemsContainer.replaceChildren();

      aiSuggestedItems.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'ai-preview-item';

        const itemLabel = document.createElement('strong');
        itemLabel.textContent = `${formatItemQuantity(item.quantity, item.unit)} × ${item.name}`;

        const sectorLabel = document.createElement('small');
        sectorLabel.textContent = item.sector;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'ai-preview-remove';
        removeButton.title = `Retirar ${item.name}`;
        removeButton.setAttribute('aria-label', `Retirar ${item.name}`);
        removeButton.textContent = '×';
        removeButton.addEventListener('click', () => {
          aiSuggestedItems.splice(index, 1);
          renderAiListPreview({
            listName: nameInput.value,
            items: aiSuggestedItems,
          });
        });

        row.append(itemLabel, sectorLabel, removeButton);
        itemsContainer.appendChild(row);
      });

      const count = aiSuggestedItems.length;
      itemCount.textContent = `${count} ${count === 1 ? 'item' : 'itens'}`;
      preview.hidden = false;
      preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function discardAiListPreview() {
      const preview = document.getElementById('aiListPreview');
      const itemsContainer = document.getElementById('aiPreviewItems');
      aiSuggestedItems = [];
      if (itemsContainer) itemsContainer.replaceChildren();
      if (preview) preview.hidden = true;
      setAiListStatus('Sugestão descartada. Você pode pedir uma nova lista.');
    }

    async function generateAiList(event) {
      if (event) event.preventDefault();
      const promptInput = document.getElementById('aiListPrompt');
      const button = document.getElementById('generateAiListButton');
      const prompt = cleanText(promptInput && promptInput.value, 600);

      const authenticatedUser = await waitForAuthenticatedUser();
      if (!authenticatedUser) {
        setAiListStatus('Entre na sua conta para criar listas com a IA.', true);
        return;
      }
      if (sharedListId) {
        setAiListStatus('Volte para “Minhas listas” antes de criar uma lista particular com a IA.', true);
        return;
      }
      if (prompt.length < 8) {
        setAiListStatus('Descreva um pouco melhor a compra que deseja montar.', true);
        if (promptInput) promptInput.focus();
        return;
      }
      const now = Date.now();
      if (now - lastAiGenerationAt < 10000) {
        setAiListStatus('Aguarde alguns segundos antes de pedir outra lista.', true);
        return;
      }
      if (!window.GetGoListAI || typeof window.GetGoListAI.generateList !== 'function') {
        setAiListStatus('A IA ainda está carregando. Aguarde alguns segundos e tente novamente.', true);
        return;
      }

      lastAiGenerationAt = now;
      if (button) button.disabled = true;
      addChatBubble(prompt, 'user');
      if (promptInput) {
        promptInput.value = '';
        promptInput.style.height = 'auto';
      }
      setAiListStatus('Organizando quantidades, produtos e setores…');
      showChatTyping();

      try {
        const [authToken, appCheckToken] = await Promise.all([
          authenticatedUser.getIdToken(),
          getFirebaseAppCheckToken(),
        ]);
        const result = await window.GetGoListAI.generateList({
          prompt,
          authToken,
          appCheckToken,
        });
        const suggestion = normalizedAiSuggestion(result);
        if (!suggestion.items.length) {
          throw new Error('AI_EMPTY_RESULT');
        }
        hideChatTyping();
        addChatBubble('Prontinho! Organizei os itens por setor — revise antes de criar:', 'bot');
        renderAiListPreview(suggestion);
        setAiListStatus('Lista pronta para revisão. Nenhum item foi salvo ainda.');
      } catch (error) {
        console.error('Não foi possível gerar a lista inteligente.', error);
        const errorCode = error && (error.code || error.message);
        const message = errorCode === 'AI_PLAN_REQUIRED'
          ? 'Assine o plano Cestão para usar a criação de listas com IA.'
          : errorCode === 'AI_NOT_CONFIGURED'
          ? 'A inteligência artificial está aguardando a ativação segura no Firebase.'
          : errorCode === 'AI_AUTH_REQUIRED'
            ? 'Entre novamente na sua conta para montar a lista com IA.'
          : errorCode === 'AI_DEVICE_NOT_VERIFIED'
            ? 'Não foi possível validar este dispositivo. Recarregue a tela e tente novamente.'
          : errorCode === 'AI_ACCESS_BLOCKED'
            ? 'A conexão segura com a IA está bloqueada. Tente novamente em alguns minutos.'
          : errorCode === 'AI_MODEL_UNAVAILABLE'
            ? 'O assistente de listas está temporariamente indisponível.'
          : errorCode === 'AI_LIMIT_REACHED'
            ? 'Muitas listas foram solicitadas agora. Aguarde um pouco e tente novamente.'
          : errorCode === 'AI_NETWORK'
            ? 'Sem conexão com a IA. Verifique sua internet e tente novamente.'
          : errorCode === 'AI_EMPTY_RESULT'
            ? 'A IA não conseguiu formar uma lista. Tente descrever a compra de outro jeito.'
            : 'Não foi possível montar a lista agora. Tente novamente em instantes.';
        hideChatTyping();
        addChatBubble(message, 'bot error');
        setAiListStatus(message, true);
      } finally {
        if (button) button.disabled = false;
      }
    }

    function createListFromAiPreview() {
      const nameInput = document.getElementById('aiPreviewListName');
      const budgetInput = document.getElementById('aiPreviewBudget');
      if (!currentFirebaseUser) {
        setAiListStatus('Entre na sua conta para salvar esta lista.', true);
        return;
      }
      if (sharedListId) {
        setAiListStatus('Volte para “Minhas listas” antes de salvar esta lista particular.', true);
        return;
      }
      if (Object.keys(lists).length >= currentPlanLimits().maxLists) {
        setAiListStatus('Seu plano atual atingiu o limite de listas. Assine um plano com mais listas para continuar.', true);
        return;
      }

      const listName = safeListName(nameInput && nameInput.value, '');
      const initialBudget = parsePrice(budgetInput && budgetInput.value);
      if (!listName) {
        setAiListStatus('Escolha um nome para a lista.', true);
        if (nameInput) nameInput.focus();
        return;
      }
      if (lists[listName]) {
        setAiListStatus('Já existe uma lista com esse nome. Escolha outro nome.', true);
        if (nameInput) nameInput.focus();
        return;
      }
      if (!aiSuggestedItems.length) {
        setAiListStatus('Mantenha pelo menos um item antes de criar a lista.', true);
        return;
      }

      const today = new Date().toLocaleDateString();
      const newItems = aiSuggestedItems.slice(0, MAX_ITEMS_PER_LIST).map((item) => {
        const unit = normalizeItemUnit(item.unit);
        return {
          id: createEntityId('item'),
          name: cleanText(item.name, 120, 'Item'),
          price: 0,
          quantity: boundedQuantity(item.quantity, unit),
          unit,
          total: 0,
          sector: normalizeSectorName(item.sector, 'Geral'),
          date: today,
          checked: false,
        };
      });
      lists[listName] = {
        items: newItems,
        history: [],
        sectorOrder: uniqueSectorNames(newItems.map((item) => item.sector)),
        balance: initialBudget,
        initialBalance: initialBudget,
      };
      currentListName = listName;
      shoppingList = lists[listName].items;
      listHistory = lists[listName].history;
      selectedDivideListName = listName;
      saveLists();
      setupListButtons();
      populateSectorSelect();
      updateList();
      updateTotal();
      updateBalance();
      updateFooter();
      updateDashboard();
      discardAiListPreview();
      showSection('productsSection');
    }

    // ---------------------------------------------------------------------
    // Assistente de IA flutuante: abre/fecha/minimiza o painel e espelha o
    // status de texto/voz como bolhas de conversa.
    // ---------------------------------------------------------------------
    function aiChatEl(id) {
      return document.getElementById(id);
    }

    function addChatBubble(text, role = 'bot') {
      const thread = aiChatEl('aiChatThread');
      if (!thread || !text) return null;
      const bubble = document.createElement('div');
      bubble.className = `ai-chat-bubble ${role}`;
      bubble.textContent = text;
      thread.appendChild(bubble);
      thread.scrollTop = thread.scrollHeight;
      return bubble;
    }

    let aiChatTypingEl = null;

    function showChatTyping() {
      const thread = aiChatEl('aiChatThread');
      if (!thread || aiChatTypingEl) return;
      aiChatTypingEl = document.createElement('div');
      aiChatTypingEl.className = 'ai-chat-typing';
      aiChatTypingEl.innerHTML = '<span></span><span></span><span></span>';
      thread.appendChild(aiChatTypingEl);
      thread.scrollTop = thread.scrollHeight;
    }

    function hideChatTyping() {
      if (aiChatTypingEl) {
        aiChatTypingEl.remove();
        aiChatTypingEl = null;
      }
    }

    function openAiChatPanel() {
      const panel = aiChatEl('aiChatPanel');
      const fab = aiChatEl('aiFabButton');
      const pill = aiChatEl('aiChatPill');
      const unread = aiChatEl('aiChatPillUnread');
      if (!panel) return;
      panel.hidden = false;
      requestAnimationFrame(() => panel.classList.add('is-open'));
      if (fab) fab.hidden = true;
      if (pill) pill.hidden = true;
      if (unread) unread.hidden = true;
      const prompt = aiChatEl('aiListPrompt');
      if (prompt) prompt.focus();
    }

    function minimizeAiChatPanel() {
      const panel = aiChatEl('aiChatPanel');
      const pill = aiChatEl('aiChatPill');
      const fab = aiChatEl('aiFabButton');
      if (panel) panel.classList.remove('is-open');
      if (fab) fab.hidden = true;
      if (pill) pill.hidden = false;
      setTimeout(() => {
        if (panel && !panel.classList.contains('is-open')) panel.hidden = true;
      }, 220);
    }

    function closeAiChatPanel() {
      const panel = aiChatEl('aiChatPanel');
      const pill = aiChatEl('aiChatPill');
      const fab = aiChatEl('aiFabButton');
      if (panel) panel.classList.remove('is-open');
      if (pill) pill.hidden = true;
      if (fab) fab.hidden = false;
      setTimeout(() => {
        if (panel && !panel.classList.contains('is-open')) panel.hidden = true;
      }, 220);
    }

    function initAiChatPanel() {
      const fab = aiChatEl('aiFabButton');
      const pill = aiChatEl('aiChatPill');
      const minimizeButton = aiChatEl('aiChatMinimizeButton');
      const closeButton = aiChatEl('aiChatCloseButton');
      const prompt = aiChatEl('aiListPrompt');
      if (fab) fab.addEventListener('click', openAiChatPanel);
      if (pill) pill.addEventListener('click', openAiChatPanel);
      if (minimizeButton) minimizeButton.addEventListener('click', minimizeAiChatPanel);
      if (closeButton) closeButton.addEventListener('click', closeAiChatPanel);
      if (prompt) {
        prompt.addEventListener('input', () => {
          prompt.style.height = 'auto';
          prompt.style.height = `${Math.min(prompt.scrollHeight, 70)}px`;
        });
        prompt.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
          event.preventDefault();
          if (!prompt.disabled && prompt.value.trim()) {
            generateAiList();
          }
        });
      }
    }

    function openAiChatForVoice() {
      openAiChatPanel();
      const voiceButton = aiChatEl('voiceCommandButton');
      if (voiceButton && !voiceButton.disabled) voiceButton.click();
    }

    function initHomeQuickActions() {
      const bindings = [
        ['homeQuickAskAi', openAiChatPanel],
        ['homeFeatureAi', openAiChatPanel],
        ['homeQuickAddItem', () => showSection('productsSection')],
        ['homeQuickNewList', createNewListDialog],
        ['homeQuickDivide', () => showSection('divideSection')],
        ['homeFeatureDivide', () => showSection('divideSection')],
        ['homeQuickShare', showShareDialog],
        ['homeFeatureShare', showShareDialog],
        ['homeFeatureVoice', openAiChatForVoice],
        ['homeFeatureHistory', () => showSection('historySection')],
        ['homeFeatureLists', () => showSection('shoppingSection')],
        ['homeListsSeeAll', () => showSection('shoppingSection')],
      ];
      bindings.forEach(([id, handler]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
      });
    }

    let voiceRecognition = null;
    let voiceRecognitionActive = false;
    let voiceFinalTranscript = '';

    function setVoiceStatus(message, isError = false) {
      const status = document.getElementById('voiceCommandStatus');
      if (!status) return;
      status.textContent = message;
      status.classList.toggle('is-error', Boolean(isError));
    }

    function setVoiceTranscript(text) {
      const transcript = document.getElementById('voiceTranscript');
      if (transcript) transcript.textContent = text;
    }

    function normalizeVoiceMatchText(value) {
      return String(value || '')
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim();
    }

    // Comando de voz manda só o nome falado (ex.: "leite"), que raramente
    // bate exato com o nome salvo (ex.: "Leite integral") — por isso tenta
    // igualdade exata primeiro e cai pra correspondência parcial nos dois
    // sentidos antes de desistir.
    function findMatchingItemIndex(items, spokenName) {
      const target = normalizeVoiceMatchText(spokenName);
      if (!target) return -1;
      const exactIndex = items.findIndex((item) => normalizeVoiceMatchText(item.name) === target);
      if (exactIndex !== -1) return exactIndex;
      return items.findIndex((item) => {
        const itemName = normalizeVoiceMatchText(item.name);
        return itemName.includes(target) || target.includes(itemName);
      });
    }

    function applyVoiceActions(actions) {
      if (!currentListName || !lists[currentListName]) {
        setVoiceStatus('Nenhuma lista está aberta no momento.', true);
        return;
      }
      const today = new Date().toLocaleDateString();
      let added = 0;
      let removed = 0;
      let cleared = false;
      const notFound = [];

      actions.forEach((action) => {
        if (action.type === 'clear') {
          if (isSharedGuest()) {
            notFound.push('limpar a lista (só o dono pode)');
            return;
          }
          clearCurrentListItems();
          cleared = true;
          return;
        }
        if (action.type === 'add') {
          if (shoppingList.length >= MAX_ITEMS_PER_LIST) return;
          const unit = normalizeItemUnit(action.unit);
          const quantity = boundedQuantity(action.quantity, unit);
          const item = {
            id: createEntityId('item'),
            name: cleanText(action.name, 120, 'Item'),
            price: 0,
            quantity,
            unit,
            total: 0,
            sector: normalizeSectorName(action.sector, 'Geral'),
            date: today,
            checked: false,
          };
          shoppingList.push(item);
          listHistory.push({ ...item, id: createEntityId('history') });
          added += 1;
          return;
        }
        if (action.type === 'remove') {
          const index = findMatchingItemIndex(shoppingList, action.name);
          if (index === -1) {
            notFound.push(action.name);
            return;
          }
          const item = shoppingList[index];
          lists[currentListName].balance += item.total;
          shoppingList.splice(index, 1);
          removed += 1;
        }
      });

      try {
        saveLists();
      } catch (e) {
        console.error('Erro ao salvar listas no localStorage:', e);
      }
      updateHistory();
      updateList();
      updateTotal();
      updateBalance();
      updateMonthSelect();
      updateFooter();
      updateDashboard();

      const parts = [];
      if (added) parts.push(`${added} ${added === 1 ? 'item adicionado' : 'itens adicionados'}`);
      if (removed) parts.push(`${removed} ${removed === 1 ? 'item removido' : 'itens removidos'}`);
      if (cleared) parts.push('lista limpa');
      if (notFound.length) parts.push(`não encontrei: ${notFound.join(', ')}`);

      const hasChanges = added || removed || cleared;
      setVoiceStatus(
        parts.length ? `${parts.join(' · ')}.` : 'Não entendi o comando. Tente falar de outro jeito.',
        !hasChanges,
      );
    }

    async function processVoiceTranscript(transcript) {
      const authenticatedUser = await waitForAuthenticatedUser();
      if (!authenticatedUser) {
        setVoiceStatus('Entre na sua conta para usar o comando de voz.', true);
        return;
      }

      addChatBubble(transcript, 'user');
      setVoiceStatus('Processando...');
      showChatTyping();
      const card = document.getElementById('voiceCommandCard');
      if (card) card.classList.add('processing');
      try {
        const [authToken, appCheckToken] = await Promise.all([
          authenticatedUser.getIdToken(),
          getFirebaseAppCheckToken(),
        ]);
        const response = await fetch('/api/ai/voice-command', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'X-Firebase-AppCheck': appCheckToken,
          },
          body: JSON.stringify({ transcript }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          throw Object.assign(new Error(result.code || 'AI_TEMPORARY_ERROR'), { code: result.code });
        }
        applyVoiceActions(Array.isArray(result.actions) ? result.actions : []);
        hideChatTyping();
        const voiceStatusEl = document.getElementById('voiceCommandStatus');
        if (voiceStatusEl) {
          addChatBubble(voiceStatusEl.textContent, voiceStatusEl.classList.contains('is-error') ? 'bot error' : 'bot');
        }
      } catch (error) {
        console.error('Não foi possível interpretar o comando de voz.', error);
        const errorCode = error && (error.code || error.message);
        const message = errorCode === 'AI_PLAN_REQUIRED'
          ? 'Assine o plano Cestão para usar comandos de voz.'
          : errorCode === 'AI_AUTH_REQUIRED'
            ? 'Entre novamente na sua conta para usar o comando de voz.'
          : errorCode === 'AI_DEVICE_NOT_VERIFIED'
            ? 'Não foi possível validar este dispositivo. Recarregue a tela e tente novamente.'
          : errorCode === 'AI_LIMIT_REACHED'
            ? 'Muitos comandos de voz seguidos. Aguarde um pouco e tente novamente.'
          : errorCode === 'AI_NETWORK'
            ? 'Sem conexão com a IA. Verifique sua internet e tente novamente.'
          : errorCode === 'AI_NOT_CONFIGURED'
            ? 'O comando de voz está aguardando ativação. Tente novamente mais tarde.'
          : errorCode === 'AI_EMPTY_RESULT'
            ? 'Não entendi o comando. Tente falar de outro jeito.'
            : 'Não foi possível processar o comando agora. Tente novamente.';
        hideChatTyping();
        addChatBubble(message, 'bot error');
        setVoiceStatus(message, true);
      } finally {
        if (card) card.classList.remove('processing');
      }
    }

    function initVoiceCommand() {
      const button = document.getElementById('voiceCommandButton');
      const card = document.getElementById('voiceCommandCard');
      if (!button || !card) return;

      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor || isNativeAppShell) {
        card.hidden = true;
        return;
      }

      voiceRecognition = new SpeechRecognitionCtor();
      voiceRecognition.lang = 'pt-BR';
      voiceRecognition.continuous = true;
      voiceRecognition.interimResults = true;

      voiceRecognition.addEventListener('start', () => {
        voiceRecognitionActive = true;
        card.classList.add('listening');
        setVoiceStatus('Estou ouvindo...');
      });

      voiceRecognition.addEventListener('result', (event) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }
        if (finalText) {
          voiceFinalTranscript = `${voiceFinalTranscript} ${finalText}`.trim();
        }
        setVoiceTranscript(`${voiceFinalTranscript} ${interimText}`.trim());
      });

      voiceRecognition.addEventListener('error', (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setVoiceStatus('Permita o uso do microfone nas configurações do navegador para falar sua lista.', true);
        } else if (event.error === 'no-speech') {
          setVoiceStatus('Não ouvi nada. Toque no microfone e tente novamente.', true);
        } else {
          setVoiceStatus('Não foi possível usar o microfone agora. Tente novamente.', true);
        }
      });

      voiceRecognition.addEventListener('end', () => {
        voiceRecognitionActive = false;
        card.classList.remove('listening');
        const transcript = voiceFinalTranscript.trim();
        voiceFinalTranscript = '';
        if (transcript) {
          processVoiceTranscript(transcript);
        }
      });

      card.hidden = false;
      button.addEventListener('click', async () => {
        if (voiceRecognitionActive) {
          voiceRecognition.stop();
          return;
        }
        const authenticatedUser = await waitForAuthenticatedUser();
        if (!authenticatedUser) {
          setVoiceStatus('Entre na sua conta para usar o comando de voz.', true);
          return;
        }
        voiceFinalTranscript = '';
        setVoiceTranscript('');
        try {
          voiceRecognition.start();
        } catch (error) {
          console.warn('Não foi possível iniciar o reconhecimento de voz.', error);
        }
      });
    }

    function availableSectorNames() {
      const currentList = lists[currentListName] || {};
      const itemSectors = Array.isArray(currentList.items)
        ? currentList.items.map((item) => item && item.sector)
        : [];
      return uniqueSectorNames([
        ...predefinedSectors,
        ...(Array.isArray(currentList.sectorOrder) ? currentList.sectorOrder : []),
        ...itemSectors,
      ]);
    }

    function isPredefinedSectorName(sectorName) {
      const normalizedKey = normalizeSectorName(sectorName).toLocaleLowerCase('pt-BR');
      return predefinedSectors.some((sector) => sector.toLocaleLowerCase('pt-BR') === normalizedKey);
    }

    function populateSectorSelect(selectedSector = '') {
      const select = document.getElementById('itemSector');
      if (!select) return;
      const previousValue = normalizeSectorName(selectedSector || select.value);
      const sectorNames = availableSectorNames();
      select.innerHTML = '';
      sectorNames.forEach((sector) => {
        const opt = document.createElement('option');
        opt.value = sector;
        opt.textContent = sector;
        select.appendChild(opt);
      });
      const createOption = document.createElement('option');
      createOption.value = CREATE_SECTOR_OPTION_VALUE;
      createOption.textContent = '+ Adicionar setor';
      select.appendChild(createOption);
      if (previousValue && sectorNames.some((sector) => sector === previousValue)) {
        select.value = previousValue;
      } else {
        select.value = sectorNames.includes('Geral') ? 'Geral' : (sectorNames[0] || '');
      }
      select.dataset.lastSector = select.value;
    }

    function openCreateSectorDialog() {
      const dialog = document.getElementById('createSectorDialog');
      const input = document.getElementById('newSectorName');
      const error = document.getElementById('createSectorError');
      if (!dialog || !input) return;
      input.value = '';
      if (error) {
        error.textContent = '';
        error.style.display = 'none';
      }
      dialog.style.display = 'flex';
      window.setTimeout(() => input.focus(), 50);
    }

    function createCustomSector() {
      const input = document.getElementById('newSectorName');
      const error = document.getElementById('createSectorError');
      const currentList = lists[currentListName];
      if (!input || !currentList) return;

      const sectorName = normalizeSectorName(input.value);
      const existingSectors = availableSectorNames();
      const exists = existingSectors.some((sector) =>
        sector.toLocaleLowerCase('pt-BR') === sectorName.toLocaleLowerCase('pt-BR')
      );
      const showError = (message) => {
        if (error) {
          error.textContent = message;
          error.style.display = 'block';
        } else {
          alert(message);
        }
      };

      if (!sectorName) {
        showError('Digite um nome para o setor.');
        return;
      }
      if (exists) {
        showError('Esse setor já existe nesta lista.');
        return;
      }
      if (existingSectors.length >= MAX_SECTORS_PER_LIST) {
        showError(`Esta lista atingiu o limite de ${MAX_SECTORS_PER_LIST} setores.`);
        return;
      }

      currentList.sectorOrder = uniqueSectorNames([
        ...(Array.isArray(currentList.sectorOrder) ? currentList.sectorOrder : []),
        sectorName,
      ]);
      collapsedSectors.delete(sectorName);
      sectorsDefaultedCollapsed.add(sectorName);
      closeDialog('createSectorDialog');
      input.value = '';
      saveLists();
      populateSectorSelect(sectorName);
      updateList();
    }

    function deleteCustomSector(sectorName) {
      const normalizedSector = normalizeSectorName(sectorName);
      const currentList = lists[currentListName];
      if (!normalizedSector || !currentList || isPredefinedSectorName(normalizedSector)) {
        alert('Os setores padrão do GetGoList não podem ser excluídos.');
        return;
      }

      const sectorKey = normalizedSector.toLocaleLowerCase('pt-BR');
      const affectedItems = currentList.items.filter((item) =>
        normalizeSectorName(item.sector, 'Geral').toLocaleLowerCase('pt-BR') === sectorKey
      );
      const affectedHistory = currentList.history.filter((item) =>
        normalizeSectorName(item.sector, 'Geral').toLocaleLowerCase('pt-BR') === sectorKey
      );
      const affectedCount = affectedItems.length;
      const migrationMessage = affectedCount === 1
        ? ' O produto será movido para “Geral”.'
        : affectedCount > 1
          ? ` Os ${affectedCount} produtos serão movidos para “Geral”.`
          : '';

      if (!confirm(`Excluir o setor “${normalizedSector}”?${migrationMessage}`)) {
        return;
      }

      affectedItems.forEach((item) => {
        item.sector = 'Geral';
      });
      affectedHistory.forEach((item) => {
        item.sector = 'Geral';
      });
      currentList.sectorOrder = uniqueSectorNames(
        (Array.isArray(currentList.sectorOrder) ? currentList.sectorOrder : [])
          .filter((sector) => sector.toLocaleLowerCase('pt-BR') !== sectorKey)
      );
      collapsedSectors.delete(normalizedSector);
      if (quickAddSector === normalizedSector) quickAddSector = null;

      saveLists();
      populateSectorSelect('Geral');
      updateList();
      updateHistory();
      updateFooter();
      updateDashboard();
    }

    function updateStats() {
      const totalLists = Object.keys(lists).length;
      const totalItems = Object.values(lists).reduce((sum, list) => sum + list.history.length, 0);
      const totalSpent = Object.values(lists).reduce((sum, list) => 
        sum + list.history.reduce((listSum, item) => listSum + item.total, 0), 0);
      
      // Calcular média mensal
      const allHistory = Object.values(lists).flatMap(list => list.history);
      const monthlyTotals = {};
      allHistory.forEach(item => {
        const date = new Date(item.date.split('/').reverse().join('-'));
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + item.total;
      });
      const avgMonthly = Object.keys(monthlyTotals).length > 0 ? 
        Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0) / Object.keys(monthlyTotals).length : 0;

      const spentLabel = `R$ ${totalSpent.toFixed(2).replace('.', ',')}`;
      const avgLabel = `R$ ${avgMonthly.toFixed(2).replace('.', ',')}`;

      document.getElementById('totalLists').textContent = totalLists;
      document.getElementById('totalItems').textContent = totalItems;
      document.getElementById('totalSpent').textContent = spentLabel;
      document.getElementById('avgMonthly').textContent = avgLabel;

      const homeStatLists = document.getElementById('homeStatLists');
      const homeStatItems = document.getElementById('homeStatItems');
      const homeStatSpent = document.getElementById('homeStatSpent');
      const homeStatAvg = document.getElementById('homeStatAvg');
      if (homeStatLists) homeStatLists.textContent = totalLists;
      if (homeStatItems) homeStatItems.textContent = totalItems;
      if (homeStatSpent) homeStatSpent.textContent = spentLabel;
      if (homeStatAvg) homeStatAvg.textContent = avgLabel;
    }

    function updateCharts() {
      updateMonthlyChart();
      updateItemsChart();
      updateExpenseChart();
      updateTrendChart();
    }

    // Equivalente em hex das CSS vars --gg-primary/--gg-accent/etc
    // (app-theme.css) — Chart.js não lê custom properties diretamente.
    const CHART_COLORS = {
      primary: '#087f8c',
      primaryDark: '#055f69',
      primarySoft: 'rgba(8, 127, 140, 0.12)',
      accent: '#ffb703',
      accentDark: '#e29c00',
      accentSoft: 'rgba(255, 183, 3, 0.15)',
      muted: '#64748b',
      doughnut: ['#087f8c', '#ffb703', '#055f69', '#e29c00', '#64748b'],
    };

    function updateMonthlyChart() {
      const ctx = document.getElementById('monthlyChart').getContext('2d');
      
      if (charts.monthly) {
        charts.monthly.destroy();
      }

      const allHistory = Object.values(lists).flatMap(list => list.history);
      const monthlyData = {};
      
      allHistory.forEach(item => {
        const date = new Date(item.date.split('/').reverse().join('-'));
        const monthKey = date.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + item.total;
      });

      const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
        const dateA = new Date(a.split(' ')[1], getMonthNumber(a.split(' ')[0]));
        const dateB = new Date(b.split(' ')[1], getMonthNumber(b.split(' ')[0]));
        return dateA - dateB;
      });

      charts.monthly = new Chart(ctx, {
        type: 'line',
        data: {
          labels: sortedMonths,
          datasets: [{
            label: 'Gastos (R$)',
            data: sortedMonths.map(month => monthlyData[month]),
            borderColor: CHART_COLORS.primary,
            backgroundColor: CHART_COLORS.primarySoft,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return 'R$ ' + value.toFixed(0);
                }
              }
            }
          }
        }
      });
    }

    function updateItemsChart() {
      const ctx = document.getElementById('itemsChart').getContext('2d');
      
      if (charts.items) {
        charts.items.destroy();
      }

      const allHistory = Object.values(lists).flatMap(list => list.history);
      const itemCounts = {};
      
      allHistory.forEach(item => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
      });

      const sortedItems = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      charts.items = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: sortedItems.map(item => item[0]),
          datasets: [{
            data: sortedItems.map(item => item[1]),
            backgroundColor: CHART_COLORS.doughnut
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }

    function updateExpenseChart() {
      const ctx = document.getElementById('expenseChart').getContext('2d');
      
      if (charts.expense) {
        charts.expense.destroy();
      }

      const allHistory = Object.values(lists).flatMap(list => list.history);
      const ranges = {
        'Até R$ 10': 0,
        'R$ 10-30': 0,
        'R$ 30-50': 0,
        'R$ 50-100': 0,
        'Acima R$ 100': 0
      };
      
      allHistory.forEach(item => {
        if (item.total <= 10) ranges['Até R$ 10']++;
        else if (item.total <= 30) ranges['R$ 10-30']++;
        else if (item.total <= 50) ranges['R$ 30-50']++;
        else if (item.total <= 100) ranges['R$ 50-100']++;
        else ranges['Acima R$ 100']++;
      });

      charts.expense = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: Object.keys(ranges),
          datasets: [{
            label: 'Quantidade de Compras',
            data: Object.values(ranges),
            backgroundColor: CHART_COLORS.primary
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1
              }
            }
          }
        }
      });
    }

    function updateTrendChart() {
      const ctx = document.getElementById('trendChart').getContext('2d');
      
      if (charts.trend) {
        charts.trend.destroy();
      }

      const allHistory = Object.values(lists).flatMap(list => list.history);
      const weeklyData = {};
      
      allHistory.forEach(item => {
        const date = new Date(item.date.split('/').reverse().join('-'));
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toLocaleDateString('pt-BR');
        weeklyData[weekKey] = (weeklyData[weekKey] || 0) + item.total;
      });

      const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        return new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-'));
      }).slice(-8); // Últimas 8 semanas

      charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
          labels: sortedWeeks.map(week => `Sem ${week.split('/')[0]}/${week.split('/')[1]}`),
          datasets: [{
            label: 'Gastos Semanais (R$)',
            data: sortedWeeks.map(week => weeklyData[week]),
            borderColor: CHART_COLORS.accentDark,
            backgroundColor: CHART_COLORS.accentSoft,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return 'R$ ' + value.toFixed(0);
                }
              }
            }
          }
        }
      });
    }

    function getMonthNumber(monthName) {
      const months = {
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
      };
      return months[monthName] || 0;
    }

    function toggleMenu() {
      isMenuOpen = !isMenuOpen;
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('overlay');
      const menuToggle = document.getElementById('menuToggle');
      
      if (isMenuOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        menuToggle.classList.add('active');
        menuToggle.innerHTML = '✕';
      } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        menuToggle.classList.remove('active');
        menuToggle.innerHTML = '☰';
      }
    }

    function closeMenu() {
      if (isMenuOpen) {
        toggleMenu();
      }
      closeAccountMenu();
    }

    function positionAccountDropdown() {
      const trigger = document.getElementById('sidebarAccountTrigger');
      const dropdown = document.getElementById('accountDropdown');
      if (!trigger || !dropdown) {
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const dropdownWidth = dropdown.offsetWidth || 240;
      const margin = 12;
      let left = triggerRect.right + 10;
      if (left + dropdownWidth > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - dropdownWidth - margin);
      }
      const bottom = Math.max(margin, window.innerHeight - triggerRect.bottom);
      dropdown.style.left = `${left}px`;
      dropdown.style.bottom = `${bottom}px`;
    }

    function toggleAccountMenu() {
      const dropdown = document.getElementById('accountDropdown');
      if (!dropdown) {
        return;
      }
      if (dropdown.classList.contains('open')) {
        closeAccountMenu();
      } else {
        openAccountMenu();
      }
    }

    function openAccountMenu() {
      const dropdown = document.getElementById('accountDropdown');
      const trigger = document.getElementById('sidebarAccountTrigger');
      if (!dropdown || !trigger) {
        return;
      }
      dropdown.classList.add('open');
      dropdown.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
      positionAccountDropdown();
    }

    function closeAccountMenu() {
      const dropdown = document.getElementById('accountDropdown');
      const trigger = document.getElementById('sidebarAccountTrigger');
      if (!dropdown) {
        return;
      }
      dropdown.classList.remove('open');
      dropdown.setAttribute('aria-hidden', 'true');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
      }
    }

    function setCompactNavCollapsed(collapsed, persist = true) {
      const toggle = document.getElementById('navRailToggle');
      document.body.classList.toggle('nav-collapsed', collapsed);
      if (toggle) {
        const label = collapsed ? 'Expandir menu' : 'Recolher menu';
        toggle.textContent = collapsed ? '›' : '‹';
        toggle.title = label;
        toggle.setAttribute('aria-label', label);
        toggle.setAttribute('aria-expanded', String(!collapsed));
      }
      if (persist) {
        try {
          localStorage.setItem('compactNavCollapsed', collapsed ? '1' : '0');
        } catch (error) {
          console.warn('Não foi possível salvar a preferência do menu.', error);
        }
      }
    }

    function initializeCompactNav() {
      if (!isNativeAppShell) {
        // Na web o menu fica fixo, sempre aberto, sem opção de recolher.
        const toggle = document.getElementById('navRailToggle');
        if (toggle) toggle.style.display = 'none';
        setCompactNavCollapsed(false, false);
        return;
      }
      let collapsed = false;
      try {
        collapsed = localStorage.getItem('compactNavCollapsed') === '1';
      } catch (error) {
        console.warn('Não foi possível carregar a preferência do menu.', error);
      }
      setCompactNavCollapsed(collapsed, false);
    }

    function handleSidebarNavClick(action) {
      if (isNativeAppShell) {
        setCompactNavCollapsed(true);
      }
      action();
    }

    function updateFooter() {
      const footerListName = document.getElementById('footerListName');
      const footerItemCount = document.getElementById('footerItemCount');
      const footerBalance = document.getElementById('footerBalance');
      const productListName = document.getElementById('productListName');
      const productItemCount = document.getElementById('productItemCount');
      const productBalance = document.getElementById('productBalance');
      const currentListSelect = document.getElementById('currentListSelect');
      
      if (footerListName && footerItemCount && footerBalance) {
        const balance = lists[currentListName].balance;
        const itemCount = lists[currentListName].items.length;
        
        footerListName.textContent = currentListName;
        footerItemCount.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`;
        footerBalance.textContent = `R$ ${balance.toFixed(2).replace('.', ',')}`;
        if (productListName) productListName.textContent = currentListName;
        if (productItemCount) productItemCount.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`;
        if (productBalance) productBalance.textContent = balance.toFixed(2).replace('.', ',');
        if (currentListSelect?.selectedOptions?.[0]) {
          currentListSelect.selectedOptions[0].textContent = `${currentListName} (${itemCount} ${itemCount === 1 ? 'item' : 'itens'})`;
        }
        
        // Remove classes anteriores
        footerBalance.classList.remove('negative', 'positive');
        
        // Adiciona classe baseada no saldo
        if (balance < 0) {
          footerBalance.classList.add('negative');
        } else if (balance > 0) {
          footerBalance.classList.add('positive');
        }
      } else {
        console.error("Elementos do rodapé não encontrados");
      }
    }

    function showSection(sectionId) {
      if ((sectionId === 'shoppingSection' || sectionId === 'productsSection') && sharedListId && sharedListEnded) {
        clearRememberedSharedList(sharedListId);
        openPrivateLists();
        return;
      }
      document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
      });
      document.querySelectorAll('.sidebar button').forEach(button => {
        button.classList.remove('active');
      });
      const targetSection = document.getElementById(sectionId);
      if (targetSection) {
        targetSection.classList.add('active');
      } else {
        console.error(`Seção ${sectionId} não encontrada`);
      }
      const sectionButtons = {
        homeSection: '.home-button',
        managementSection: '.management-button',
        shoppingSection: '.shopping-button',
        productsSection: '.products-button',
        historySection: '.history-button',
        divideSection: '.divide-button',
        profileSection: '#accountDropdownProfileButton'
      };
      const targetButton = sectionButtons[sectionId]
        ? document.querySelector(sectionButtons[sectionId])
        : null;
      if (targetButton) {
        targetButton.classList.add('active');
      }
      const sectionTitles = {
        homeSection: 'Início',
        managementSection: 'Gestão',
        shoppingSection: 'Listas',
        productsSection: 'Produtos',
        historySection: 'Histórico',
        divideSection: 'Divisão',
        profileSection: 'Meu Perfil'
      };
      document.getElementById('mainTitle').textContent = sectionTitles[sectionId] || 'Lista de Compras';
      const sectionSubtitles = {
        homeSection: 'Crie uma lista completa com a ajuda da inteligência artificial.',
        managementSection: 'Acompanhe seus números e hábitos de compra.',
        shoppingSection: 'Crie, organize e defina o orçamento das suas listas.',
        productsSection: 'Monte sua compra e acompanhe cada item da lista.',
        historySection: 'Consulte compras anteriores e compare períodos.',
        divideSection: 'Calcule e envie a parte de cada pessoa.',
        profileSection: 'Personalize sua experiência no GetGoList.'
      };
      const subtitle = document.getElementById('homeSubtitle');
      if (subtitle) subtitle.textContent = sectionSubtitles[sectionId] || '';
      
      // Fecha o menu após selecionar uma opção
      closeMenu();
      
      if (!currentFirebaseUser && sectionId !== 'homeSection') {
        alert('Faça login para acessar esta área.');
        showSection('homeSection');
        return;
      }
      if (currentFirebaseUser && sectionId === 'managementSection' && !currentPlanLimits().hasGestao) {
        alert('Assine o plano Cestão para acessar a Gestão.');
        showSection('homeSection');
        return;
      }

      updateSharedModeUi();

      if (sectionId === 'managementSection') {
        updateDashboard();
      }
      if (sectionId === 'shoppingSection' || sectionId === 'productsSection') {
        // Revalida o atalho de "lista compartilhada recente" toda vez que
        // volta pra uma dessas telas (as duas mostram o banner de atalho)
        // — sem isso, ele só era atualizado no login, e clicar num atalho
        // de uma lista já finalizada (por você ou por quem é dono dela)
        // derrubava pra tela inicial com um alerta fácil de não perceber.
        syncSharedListsForAccount();
      }
      if (sectionId === 'productsSection') {
        populateSectorSelect();
        updateList();
        updateTotal();
        updateBalance();
        updateFooter();
      }
      if (sectionId === 'historySection') {
        updateHistory();
        updateTargetListSelect();
      }
      if (sectionId === 'profileSection') {
        updateProfileSection();
        loadPaymentHistory();
      }
      if (sectionId === 'divideSection') {
        document.getElementById('divisionResult').innerHTML = '';
        updateDivideListSelect();
      }
    }

    function formatPrice(input) {
      let value = input.value.replace(/[^\d]/g, '');
      if (value === '') {
        input.value = '';
        return;
      }
      value = (parseInt(value) / 100).toFixed(2).replace('.', ',');
      input.value = value;
    }

    function parsePrice(value) {
      return boundedNumber(parseFloat(String(value).replace(',', '.')), 0, 100000000, 0);
    }

    function openBudgetDialog() {
      if (isSharedGuest()) {
        return;
      }
      const dialog = document.getElementById('budgetDialog');
      const balanceInput = document.getElementById('balanceInput');
      const budgetListName = document.getElementById('budgetListName');
      if (!dialog || !balanceInput || !budgetListName || !lists[currentListName]) {
        return;
      }
      budgetListName.textContent = currentListName;
      balanceInput.value = Number(lists[currentListName].initialBalance || 0)
        .toFixed(2)
        .replace('.', ',');
      dialog.style.display = 'flex';
      balanceInput.focus();
    }

    function setBalance() {
      if (isSharedGuest()) {
        return;
      }
      const balanceInput = document.getElementById('balanceInput');
      if (!balanceInput) {
        console.error("Elemento de entrada de saldo não encontrado");
        return;
      }
      if (!lists[currentListName]) {
        alert('A lista atual não está disponível.');
        return;
      }
      const balanceValue = parsePrice(balanceInput.value);
      if (balanceValue >= 0) {
        const totalSpent = lists[currentListName].items.reduce((sum, item) => sum + item.total, 0);
        lists[currentListName].initialBalance = balanceValue;
        lists[currentListName].balance = balanceValue - totalSpent;
        hasShownLowBalanceAlert = false;
        try {
          saveLists();
          console.log("Orçamento atualizado para:", currentListName, lists[currentListName]);
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        updateBalance();
        updateTotal();
        updateFooter();
        closeDialog('budgetDialog');
      } else {
        alert('Por favor, insira um orçamento válido.');
      }
    }

    function addItemToCurrentList(itemName, itemPrice, itemQuantity, itemSector, itemUnit) {
      itemName = cleanText(itemName, 120);
      itemPrice = boundedNumber(itemPrice, 0, 100000000, 0);
      itemUnit = normalizeItemUnit(itemUnit);
      itemQuantity = boundedQuantity(itemQuantity, itemUnit);
      itemSector = normalizeSectorName(itemSector, 'Geral');
      if (shoppingList.length >= MAX_ITEMS_PER_LIST) {
        alert(`Esta lista atingiu o limite de ${MAX_ITEMS_PER_LIST} itens.`);
        return false;
      }
      const itemTotal = itemPrice * itemQuantity;

      if (itemName && itemPrice > 0 && itemQuantity > 0) {
        const currentBalance = lists[currentListName].balance;
        if (currentBalance >= 0 && itemTotal > currentBalance) {
          if (!confirm(`O valor ultrapassa o saldo. Confirma inclusão do produto? (Total: R$ ${itemTotal.toFixed(2).replace('.', ',')} | Saldo: R$ ${currentBalance.toFixed(2).replace('.', ',')})`)) {
            return false;
          }
        }
        const item = {
          id: createEntityId('item'),
          name: itemName,
          price: itemPrice,
          quantity: itemQuantity,
          unit: itemUnit,
          total: itemTotal,
          sector: itemSector,
          date: new Date().toLocaleDateString(),
          checked: false
        };
        shoppingList.push(item);
        listHistory.push({ ...item, id: createEntityId('history') });
        lists[currentListName].balance -= item.total;
        try {
          saveLists();
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        updateList();
        updateTotal();
        updateBalance();
        updateMonthSelect();
        updateFooter();
        updateDashboard();
        return true;
      }

      alert('Por favor, insira um nome, preço e quantidade válidos.');
      return false;
    }

    function addItem() {
      const itemName = document.getElementById('itemName').value.trim();
      const itemPrice = parsePrice(document.getElementById('itemPrice').value);
      const itemUnit = normalizeItemUnit(document.getElementById('itemUnit').value);
      const itemQuantity = parseFloat(document.getElementById('itemQuantity').value) || 1;
      const itemSector = document.getElementById('itemSector').value.trim() || 'Geral';

      if (addItemToCurrentList(itemName, itemPrice, itemQuantity, itemSector, itemUnit)) {
        document.getElementById('itemName').value = '';
        document.getElementById('itemPrice').value = '';
        document.getElementById('itemQuantity').value = '1';
        document.getElementById('itemUnit').value = 'un';
        updateItemUnitStep(document.getElementById('itemQuantity'), 'un');
        populateSectorSelect('Geral');
      }
    }

    function editItem(index) {
      if (editingIndex !== null) {
        alert('Por favor, conclua ou cancele a edição atual antes de editar outro item.');
        return;
      }
      editingIndex = index;
      updateList();
    }

    function saveEdit(index) {
      const li = document.getElementById(`item-${index}`);
      if (!li) {
        console.error(`Elemento item-${index} não encontrado`);
        return;
      }
      const itemName = cleanText(li.querySelector('.edit-name').value, 120);
      const itemPrice = parsePrice(li.querySelector('.edit-price').value);
      const unitEl = li.querySelector('.edit-unit');
      const itemUnit = normalizeItemUnit(unitEl ? unitEl.value : 'un');
      const itemQuantity = boundedQuantity(parseFloat(li.querySelector('.edit-quantity').value), itemUnit);
      const sectorEl = li.querySelector('.edit-sector');
      const itemSector = normalizeSectorName(sectorEl ? (sectorEl.value || 'Geral') : 'Geral', 'Geral');
      const itemTotal = itemPrice * itemQuantity;

      if (itemName && itemPrice > 0 && itemQuantity > 0) {
        const oldItem = shoppingList[index];
        lists[currentListName].balance += oldItem.total;
        const currentBalance = lists[currentListName].balance;
        if (currentBalance >= 0 && itemTotal > currentBalance) {
          if (!confirm(`O valor ultrapassa o saldo. Confirma inclusão do produto? (Total: R$ ${itemTotal.toFixed(2).replace('.', ',')} | Saldo: R$ ${currentBalance.toFixed(2).replace('.', ',')})`)) {
            lists[currentListName].balance -= oldItem.total;
            return;
          }
        }
        const newItem = {
          id: oldItem.id || createEntityId('item'),
          name: itemName,
          price: itemPrice,
          quantity: itemQuantity,
          unit: itemUnit,
          total: itemTotal,
          sector: itemSector,
          date: new Date().toLocaleDateString(),
          checked: oldItem.checked
        };
        shoppingList[index] = newItem;
        listHistory.push({ ...newItem, id: createEntityId('history') });
        lists[currentListName].balance -= newItem.total;
        try {
          saveLists();
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        editingIndex = null;
        updateList();
        updateTotal();
        updateBalance();
        updateMonthSelect();
        updateFooter();
        updateDashboard();
      } else {
        alert('Por favor, insira um nome, preço e quantidade válidos.');
      }
    }

    function cancelEdit() {
      editingIndex = null;
      updateList();
    }

    function removeItem(index) {
      const item = shoppingList[index];
      if (!item) {
        return;
      }
      const itemName = item.name ? ` “${item.name}”` : '';
      if (!confirm(`Deseja realmente excluir o item${itemName}? Esta ação não pode ser desfeita.`)) {
        return;
      }
      lists[currentListName].balance += item.total;
      shoppingList.splice(index, 1);
      try {
        saveLists();
      } catch (e) {
        console.error("Erro ao salvar listas no localStorage:", e);
      }
      updateList();
      updateTotal();
      updateBalance();
      updateFooter();
      updateDashboard();
    }

    function toggleSelectAll() {
      allSelected = !allSelected;
      shoppingList.forEach((item) => {
        item.checked = allSelected;
      });
      try {
        saveLists();
        console.log(`Todos os itens ${allSelected ? 'marcados' : 'desmarcados'}`);
      } catch (e) {
        console.error("Erro ao salvar listas no localStorage:", e);
      }
      updateList();
    }

    function deleteSelectedListItems() {
      const checkboxes = document.querySelectorAll('input[name="listItem"]:checked');
      if (checkboxes.length === 0) {
        alert('Selecione pelo menos um item para excluir!');
        return;
      }
      if (confirm('Tem certeza que deseja excluir os itens selecionados da lista? Esta ação não pode ser desfeita.')) {
        const indices = Array.from(checkboxes).map(cb => parseInt(cb.value));
        indices.sort((a, b) => b - a);
        indices.forEach(index => {
          const item = shoppingList[index];
          lists[currentListName].balance += item.total;
          console.log(`Excluindo item da lista no índice: ${index}`);
          shoppingList.splice(index, 1);
        });
        try {
          saveLists();
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        allSelected = false;
        updateList();
        updateTotal();
        updateBalance();
        updateFooter();
        updateDashboard();
        console.log("Itens selecionados da lista excluídos com sucesso");
      }
    }

    function getSelectedListItemIndices() {
      return Array.from(document.querySelectorAll('input[name="listItem"]:checked'))
        .map((checkbox) => Number.parseInt(checkbox.value, 10))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < shoppingList.length);
    }

    function showMoveItemsError(message = '') {
      const error = document.getElementById('moveSelectedItemsError');
      if (!error) return;
      error.textContent = message;
      error.style.display = message ? 'block' : 'none';
    }

    function openMoveSelectedItemsDialog() {
      const selectedIndices = getSelectedListItemIndices();
      if (!selectedIndices.length) {
        alert('Selecione pelo menos um item para mover.');
        return;
      }
      if (sharedListId) {
        alert('Itens de uma lista compartilhada não podem ser movidos para suas listas privadas.');
        return;
      }

      const targetListNames = Object.keys(lists).filter((listName) => listName !== currentListName);
      if (!targetListNames.length) {
        alert('Crie outra lista antes de mover os itens.');
        return;
      }

      const dialog = document.getElementById('moveSelectedItemsDialog');
      const count = document.getElementById('moveSelectedItemsCount');
      const targetSelect = document.getElementById('moveItemsTargetListSelect');
      if (!dialog || !count || !targetSelect) return;

      count.textContent = `${selectedIndices.length} ${selectedIndices.length === 1 ? 'item' : 'itens'}`;
      targetSelect.innerHTML = '';
      targetListNames.forEach((listName) => {
        const option = document.createElement('option');
        option.value = listName;
        option.textContent = `${listName} (${lists[listName].items.length} itens)`;
        targetSelect.appendChild(option);
      });
      showMoveItemsError();
      dialog.style.display = 'flex';
    }

    function moveSelectedListItems() {
      const selectedIndices = getSelectedListItemIndices();
      const targetSelect = document.getElementById('moveItemsTargetListSelect');
      const targetListName = safeListName(targetSelect?.value, '');
      const targetList = lists[targetListName];
      const sourceList = lists[currentListName];

      if (!selectedIndices.length) {
        showMoveItemsError('Os itens não estão mais selecionados. Feche esta janela e selecione novamente.');
        return;
      }
      if (!targetList || targetListName === currentListName || !sourceList) {
        showMoveItemsError('Escolha uma lista de destino válida.');
        return;
      }
      if (targetList.items.length + selectedIndices.length > MAX_ITEMS_PER_LIST) {
        showMoveItemsError(`A lista de destino ultrapassaria o limite de ${MAX_ITEMS_PER_LIST} itens.`);
        return;
      }

      const selectedItems = selectedIndices.map((index) => shoppingList[index]).filter(Boolean);
      const movedTotal = selectedItems.reduce((sum, item) => sum + boundedNumber(item.total, 0, 1000000000, 0), 0);
      const budgetWarning = movedTotal > targetList.balance
        ? `\n\nAtenção: o total ultrapassa o saldo disponível em “${targetListName}” e deixará o saldo negativo.`
        : '';
      const itemLabel = selectedItems.length === 1 ? 'este item' : `estes ${selectedItems.length} itens`;
      if (!confirm(`Mover ${itemLabel} para “${targetListName}”?${budgetWarning}`)) {
        return;
      }

      const movedSectors = selectedItems.map((item) => normalizeSectorName(item.sector, 'Geral'));
      targetList.sectorOrder = uniqueSectorNames([
        ...(Array.isArray(targetList.sectorOrder) ? targetList.sectorOrder : []),
        ...movedSectors,
      ]);
      targetList.items.push(...selectedItems.map((item) => ({ ...item, checked: false })));
      sourceList.balance = boundedNumber(sourceList.balance + movedTotal, -1000000000, 1000000000, sourceList.balance);
      targetList.balance = boundedNumber(targetList.balance - movedTotal, -1000000000, 1000000000, targetList.balance);

      selectedIndices.sort((first, second) => second - first).forEach((index) => {
        shoppingList.splice(index, 1);
      });
      allSelected = false;
      closeDialog('moveSelectedItemsDialog');
      saveLists();
      setupListButtons();
      updateList();
      updateTotal();
      updateBalance();
      updateFooter();
      updateDashboard();
      alert(`${selectedItems.length} ${selectedItems.length === 1 ? 'item movido' : 'itens movidos'} para “${targetListName}”.`);
    }

    // Compartilhada entre o botão "Limpar histórico" (com confirmação) e
    // o comando de voz "limpar a lista" (a própria fala já é a confirmação).
    function clearCurrentListItems() {
      listHistory = [];
      shoppingList = [];
      lists[currentListName].history = listHistory;
      lists[currentListName].items = shoppingList;
      lists[currentListName].balance = lists[currentListName].initialBalance;
    }

    function clearHistory() {
      if (confirm('Tem certeza que deseja limpar o histórico desta lista? Esta ação não pode ser desfeita.')) {
        console.log("Limpando histórico da lista:", currentListName);
        clearCurrentListItems();
        try {
          saveLists();
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        updateHistory();
        updateList();
        updateTotal();
        updateBalance();
        updateFooter();
        updateDashboard();
        console.log("Histórico limpo com sucesso");
      }
    }

    function deleteSelectedHistoryItems() {
      const checkboxes = document.querySelectorAll('input[name="historyItem"]:checked');
      if (checkboxes.length === 0) {
        alert('Selecione pelo menos um item do histórico para excluir!');
        return;
      }
      if (confirm('Tem certeza que deseja excluir os itens selecionados do histórico? Esta ação não pode ser desfeita.')) {
        const indices = Array.from(checkboxes).map(cb => parseInt(cb.value));
        indices.sort((a, b) => b - a);
        indices.forEach(index => {
          console.log(`Excluindo item do histórico no índice: ${index}`);
          listHistory.splice(index, 1);
        });
        lists[currentListName].history = listHistory;
        try {
          saveLists();
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        updateHistory();
        updateMonthSelect();
        updateDashboard();
        console.log("Itens selecionados do histórico excluídos com sucesso");
      }
    }

    function clearComparison() {
      const comparisonView = document.getElementById('comparisonView');
      const comparisonResult = document.getElementById('comparisonResult');
      if (!comparisonResult) {
        console.error("Elemento de resultado de comparação não encontrado");
        return;
      }
      comparisonResult.innerHTML = '';
      comparisonView.style.display = 'none';
      console.log("Dados de comparação limpos com sucesso");
    }

    function bindSectorDragHandle(handle, section, list) {
      let holdTimer = null;
      let dragActive = false;
      let startY = 0;
      let pointerId = null;

      const clearHoldTimer = () => {
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
      };

      const activateDrag = () => {
        if (dragActive || pointerId === null) return;
        clearHoldTimer();
        dragActive = true;
        section.classList.add('is-dragging');
        document.body.classList.add('is-sector-dragging');
        if (window.navigator.vibrate) window.navigator.vibrate(25);
      };

      const moveDrag = (event) => {
        if (event.pointerId !== pointerId) return;

        const movement = Math.abs(event.clientY - startY);
        if (!dragActive && movement > 6) activateDrag();
        if (!dragActive) return;

        event.preventDefault();

        if (event.clientY < 80) {
          window.scrollBy(0, -12);
        } else if (event.clientY > window.innerHeight - 80) {
          window.scrollBy(0, 12);
        }

        const siblings = Array.from(list.querySelectorAll('.sector-group:not(.is-dragging)'));
        const nextSector = siblings.find((candidate) => {
          const bounds = candidate.getBoundingClientRect();
          return event.clientY < bounds.top + bounds.height / 2;
        });

        if (nextSector) {
          list.insertBefore(section, nextSector);
        } else {
          list.appendChild(section);
        }
      };

      const removeDocumentListeners = () => {
        document.removeEventListener('pointermove', moveDrag);
        document.removeEventListener('pointerup', finishDrag);
        document.removeEventListener('pointercancel', finishDrag);
      };

      const finishDrag = (event) => {
        if (event && event.pointerId !== pointerId) return;
        if (pointerId === null) return;
        pointerId = null;
        clearHoldTimer();
        removeDocumentListeners();

        if (dragActive) {
          const sectorOrder = Array.from(list.querySelectorAll('.sector-group'))
            .map((group) => group.dataset.sectorName)
            .filter(Boolean);

          if (lists[currentListName]) {
            lists[currentListName].sectorOrder = sectorOrder;
            saveLists();
          }

          section.classList.remove('is-dragging');
          document.body.classList.remove('is-sector-dragging');
          dragActive = false;
          updateList();
        }
      };

      handle.addEventListener('contextmenu', (event) => event.preventDefault());
      handle.addEventListener('click', (event) => event.preventDefault());
      handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        event.preventDefault();
        startY = event.clientY;
        pointerId = event.pointerId;
        document.addEventListener('pointermove', moveDrag, { passive: false });
        document.addEventListener('pointerup', finishDrag);
        document.addEventListener('pointercancel', finishDrag);

        holdTimer = window.setTimeout(activateDrag, 140);
      });
    }

    function updateList() {
      const list = document.getElementById('shoppingList');
      if (!list) {
        console.error("Elemento de lista de compras não encontrado");
        return;
      }

      list.innerHTML = '';

      const currentSectorOrder = Array.isArray(lists[currentListName]?.sectorOrder)
        ? uniqueSectorNames(lists[currentListName].sectorOrder)
        : [];
      const groupedItems = currentSectorOrder.reduce((groups, sectorName) => {
        groups[sectorName] = [];
        return groups;
      }, {});
      const acceptedSectorKeys = new Set(currentSectorOrder.map((sector) => sector.toLocaleLowerCase('pt-BR')));
      const canonicalSectorByKey = new Map(currentSectorOrder.map((sector) => [sector.toLocaleLowerCase('pt-BR'), sector]));

      shoppingList.forEach((item, index) => {
        let sectorName = normalizeSectorName(item?.sector, 'Geral');
        const sectorKey = sectorName.toLocaleLowerCase('pt-BR');
        if (canonicalSectorByKey.has(sectorKey)) {
          sectorName = canonicalSectorByKey.get(sectorKey);
        } else if (acceptedSectorKeys.size >= MAX_SECTORS_PER_LIST) {
          sectorName = 'Geral';
        } else {
          acceptedSectorKeys.add(sectorKey);
          canonicalSectorByKey.set(sectorKey, sectorName);
        }
        if (!groupedItems[sectorName]) {
          groupedItems[sectorName] = [];
        }
        groupedItems[sectorName].push({ item, index });
      });

      const savedSectorOrder = currentSectorOrder;
      const savedOrderPositions = new Map(savedSectorOrder.map((sector, index) => [sector, index]));
      const sectorNames = Object.keys(groupedItems).sort((first, second) => {
        const firstPosition = savedOrderPositions.has(first) ? savedOrderPositions.get(first) : Number.MAX_SAFE_INTEGER;
        const secondPosition = savedOrderPositions.has(second) ? savedOrderPositions.get(second) : Number.MAX_SAFE_INTEGER;

        if (firstPosition !== secondPosition) return firstPosition - secondPosition;
        if (first === 'Geral') return -1;
        if (second === 'Geral') return 1;
        return first.localeCompare(second, 'pt-BR');
      });

      sectorNames.forEach((sectorName) => {
        if (!sectorsDefaultedCollapsed.has(sectorName)) {
          collapsedSectors.add(sectorName);
          sectorsDefaultedCollapsed.add(sectorName);
        }
      });

      if (sectorNames.length > 1) {
        const reorderHint = document.createElement('li');
        reorderHint.className = 'sector-reorder-hint';
        reorderHint.innerHTML = '<span aria-hidden="true">⠿</span><span>Segure e arraste este ícone para organizar os setores.</span>';
        list.appendChild(reorderHint);
      }

      sectorNames.forEach((sectorName, sectorIndex) => {
        const sectorItems = groupedItems[sectorName];
        const isCollapsed = collapsedSectors.has(sectorName);
        const section = document.createElement('section');
        section.className = 'sector-group';
        section.classList.toggle('is-collapsed', isCollapsed);
        section.dataset.sectorName = sectorName;

        const headerRow = document.createElement('div');
        headerRow.className = 'sector-header-row';

        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'sector-header';
        header.setAttribute('aria-expanded', String(!isCollapsed));

        const bodyId = `sector-body-${sectorIndex}`;
        header.setAttribute('aria-controls', bodyId);

        const heading = document.createElement('span');
        heading.className = 'sector-heading';

        const chevron = document.createElement('span');
        chevron.className = 'sector-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '›';

        const labels = document.createElement('span');
        labels.className = 'sector-labels';

        const name = document.createElement('strong');
        name.className = 'sector-name';
        name.textContent = sectorName;

        const action = document.createElement('small');
        action.className = 'sector-action';
        action.textContent = isCollapsed ? 'Toque para ver os produtos' : 'Toque para recolher';

        const sectorTotal = sectorItems.reduce((sum, { item }) => sum + item.total, 0);

        const count = document.createElement('span');
        count.className = 'sector-count';
        count.textContent = `${sectorItems.length} item${sectorItems.length === 1 ? '' : 's'} · R$ ${sectorTotal.toFixed(2).replace('.', ',')}`;

        labels.appendChild(name);
        labels.appendChild(action);
        labels.appendChild(count);
        heading.appendChild(chevron);
        heading.appendChild(labels);

        header.appendChild(heading);
        header.addEventListener('click', () => {
          if (collapsedSectors.has(sectorName)) {
            collapsedSectors.delete(sectorName);
          } else {
            collapsedSectors.add(sectorName);
          }
          updateList();
        });

        const dragHandle = document.createElement('button');
        dragHandle.type = 'button';
        dragHandle.className = 'sector-drag-handle';
        dragHandle.setAttribute('aria-label', `Segure e arraste para mover o setor ${sectorName}`);
        dragHandle.title = 'Segure e arraste para ordenar';
        dragHandle.innerHTML = '<span aria-hidden="true">⠿</span>';
        bindSectorDragHandle(dragHandle, section, list);

        const quickAddButton = document.createElement('button');
        quickAddButton.type = 'button';
        quickAddButton.className = 'sector-quick-add-button';
        quickAddButton.setAttribute('aria-label', `Adicionar produto no setor ${sectorName}`);
        quickAddButton.title = `Adicionar produto em ${sectorName}`;
        quickAddButton.textContent = '+';
        quickAddButton.addEventListener('click', () => {
          quickAddSector = quickAddSector === sectorName ? null : sectorName;
          collapsedSectors.delete(sectorName);
          updateList();
          if (quickAddSector) {
            requestAnimationFrame(() => {
              document.querySelector('.sector-quick-add-form .quick-add-name')?.focus();
            });
          }
        });

        const deleteSectorButton = document.createElement('button');
        deleteSectorButton.type = 'button';
        deleteSectorButton.className = 'sector-delete-button';
        deleteSectorButton.setAttribute('aria-label', `Excluir o setor ${sectorName}`);
        deleteSectorButton.title = `Excluir setor ${sectorName}`;
        deleteSectorButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg>';
        deleteSectorButton.addEventListener('click', () => deleteCustomSector(sectorName));

        headerRow.appendChild(header);
        headerRow.appendChild(quickAddButton);
        if (!isPredefinedSectorName(sectorName)) {
          headerRow.appendChild(deleteSectorButton);
        }
        headerRow.appendChild(dragHandle);

        const body = document.createElement('div');
        body.className = 'sector-body';
        body.id = bodyId;
        if (isCollapsed) {
          body.classList.add('collapsed');
        }

        const ul = document.createElement('ul');
        ul.className = 'sector-items';

        if (quickAddSector === sectorName) {
          const quickForm = document.createElement('form');
          quickForm.className = 'sector-quick-add-form';

          const quickName = document.createElement('input');
          quickName.type = 'text';
          quickName.className = 'quick-add-name';
          quickName.maxLength = 120;
          quickName.placeholder = 'Nome do produto';
          quickName.setAttribute('aria-label', `Nome do produto em ${sectorName}`);

          const quickPrice = document.createElement('input');
          quickPrice.type = 'text';
          quickPrice.className = 'quick-add-price';
          quickPrice.placeholder = 'Preço (R$)';
          quickPrice.setAttribute('aria-label', `Preço do produto em ${sectorName}`);
          quickPrice.addEventListener('input', function () {
            formatPrice(this);
          });

          const quickQuantity = document.createElement('input');
          quickQuantity.type = 'number';
          quickQuantity.className = 'quick-add-quantity';
          quickQuantity.min = '1';
          quickQuantity.step = '1';
          quickQuantity.max = '10000';
          quickQuantity.value = '1';
          quickQuantity.setAttribute('aria-label', `Quantidade do produto em ${sectorName}`);

          const quickUnit = document.createElement('select');
          quickUnit.className = 'quick-add-unit';
          quickUnit.setAttribute('aria-label', `Unidade do produto em ${sectorName}`);
          ITEM_UNITS.forEach((unitValue) => {
            const option = document.createElement('option');
            option.value = unitValue;
            option.textContent = unitValue === 'un' ? 'Unidade' : unitValue === 'kg' ? 'Kg' : 'L';
            quickUnit.appendChild(option);
          });
          quickUnit.addEventListener('change', () => updateItemUnitStep(quickQuantity, quickUnit.value));

          const quickActions = document.createElement('div');
          quickActions.className = 'sector-quick-add-actions';

          const quickSubmit = document.createElement('button');
          quickSubmit.type = 'submit';
          quickSubmit.className = 'sector-quick-add-submit';
          quickSubmit.textContent = 'Adicionar';

          const quickCancel = document.createElement('button');
          quickCancel.type = 'button';
          quickCancel.className = 'sector-quick-add-cancel';
          quickCancel.textContent = 'Cancelar';
          quickCancel.addEventListener('click', () => {
            quickAddSector = null;
            updateList();
          });

          quickActions.appendChild(quickSubmit);
          quickActions.appendChild(quickCancel);
          quickForm.appendChild(quickName);
          quickForm.appendChild(quickPrice);
          quickForm.appendChild(quickQuantity);
          quickForm.appendChild(quickUnit);
          quickForm.appendChild(quickActions);
          quickForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const nameValue = quickName.value.trim();
            const priceValue = parsePrice(quickPrice.value);
            const unitValue = normalizeItemUnit(quickUnit.value);
            const quantityValue = parseFloat(quickQuantity.value) || 1;
            if (nameValue && priceValue > 0 && quantityValue > 0) {
              quickAddSector = null;
            }
            if (!addItemToCurrentList(nameValue, priceValue, quantityValue, sectorName, unitValue)) {
              quickAddSector = sectorName;
            }
          });

          body.appendChild(quickForm);
        }

        sectorItems.forEach(({ item, index }) => {
          const li = document.createElement('li');
          li.id = `item-${index}`;
          if (editingIndex === index) {
            li.classList.add('editing');
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'edit-name';
            nameInput.maxLength = 120;
            nameInput.value = item.name;

            const priceInput = document.createElement('input');
            priceInput.type = 'text';
            priceInput.className = 'edit-price';
            priceInput.value = item.price.toFixed(2).replace('.', ',');
            priceInput.addEventListener('input', () => formatPrice(priceInput));

            const quantityInput = document.createElement('input');
            quantityInput.type = 'number';
            quantityInput.className = 'edit-quantity';
            quantityInput.max = '10000';
            quantityInput.value = String(item.quantity);
            updateItemUnitStep(quantityInput, item.unit);

            const unitSelect = document.createElement('select');
            unitSelect.className = 'edit-unit';
            ITEM_UNITS.forEach((unitValue) => {
              const option = document.createElement('option');
              option.value = unitValue;
              option.textContent = unitValue === 'un' ? 'Unidade' : unitValue === 'kg' ? 'Kg' : 'L';
              option.selected = normalizeItemUnit(item.unit) === unitValue;
              unitSelect.appendChild(option);
            });
            unitSelect.addEventListener('change', () => updateItemUnitStep(quantityInput, unitSelect.value));

            const sectorSelect = document.createElement('select');
            sectorSelect.className = 'edit-sector';
            availableSectorNames().forEach((sector) => {
              const option = document.createElement('option');
              option.value = sector;
              option.textContent = sector;
              option.selected = (item.sector || 'Geral') === sector;
              sectorSelect.appendChild(option);
            });

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.textContent = 'Salvar';
            saveButton.addEventListener('click', () => saveEdit(index));

            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.textContent = 'Cancelar';
            cancelButton.addEventListener('click', cancelEdit);

            li.append(nameInput, priceInput, quantityInput, unitSelect, sectorSelect, saveButton, cancelButton);
          } else {
            const itemInfo = document.createElement('div');
            itemInfo.className = 'item-info';
            const itemLabel = document.createElement('span');
            if (item.checked) itemLabel.classList.add('checked');
            itemLabel.textContent = `${item.name} - ${formatItemQuantity(item.quantity, item.unit)} x R$ ${item.price.toFixed(2).replace('.', ',')} = R$ ${item.total.toFixed(2).replace('.', ',')}`;
            const sectorLabel = document.createElement('small');
            sectorLabel.className = 'item-sector-label';
            sectorLabel.textContent = `Setor: ${item.sector || 'Geral'}`;
            itemInfo.append(itemLabel, sectorLabel);

            const controls = document.createElement('div');
            controls.className = 'item-controls';
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkbox-container';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'listItem';
            checkbox.id = `list-item-${index}`;
            checkbox.value = String(index);
            checkbox.checked = item.checked;
            checkboxContainer.appendChild(checkbox);

            const actionButtons = document.createElement('div');
            actionButtons.className = 'action-buttons';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'edit';
            editButton.textContent = 'Editar';
            editButton.addEventListener('click', () => editItem(index));
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.textContent = 'Remover';
            removeButton.addEventListener('click', () => removeItem(index));
            actionButtons.append(editButton, removeButton);
            controls.append(checkboxContainer, actionButtons);
            li.append(itemInfo, controls);

            checkbox.addEventListener('change', () => {
              shoppingList[index].checked = checkbox.checked;
              try {
                saveLists();
                console.log(`Item ${index} marcado como ${checkbox.checked ? 'checked' : 'unchecked'}`);
              } catch (e) {
                console.error("Erro ao salvar listas no localStorage:", e);
              }
              updateList();
            });
          }
          ul.appendChild(li);
        });

        body.appendChild(ul);
        section.appendChild(headerRow);
        section.appendChild(body);
        list.appendChild(section);
      });

      const selectAllButton = document.querySelector('.select-all');
      if (selectAllButton) {
        selectAllButton.textContent = allSelected ? 'Desmarcar Todos' : 'Selecionar Todos';
      }
    }

    function updateTotal() {
      const total = shoppingList.reduce((sum, item) => sum + item.total, 0);
      const totalElement = document.getElementById('total');
      if (totalElement) {
        totalElement.textContent = total.toFixed(2).replace('.', ',');
      } else {
        console.error("Elemento de total não encontrado");
      }
    }

    function updateBalance() {
      const balanceElement = document.getElementById('balance');
      if (!balanceElement) {
        console.error("Elemento de saldo não encontrado");
        return;
      }
      const balance = lists[currentListName].balance;
      const initialBalance = lists[currentListName].initialBalance;
      const initialBalanceDisplay = document.getElementById('initialBalanceDisplay');
      if (initialBalanceDisplay) {
        initialBalanceDisplay.textContent = initialBalance.toFixed(2).replace('.', ',');
      }
      balanceElement.textContent = balance.toFixed(2).replace('.', ',');
      balanceElement.parentElement.className = 'balance' + (balance < 0 ? ' negative' : '');
      const alertElement = document.getElementById('lowBalanceAlert');
      if (!alertElement) {
        console.error("Elemento de alerta de saldo baixo não encontrado");
        return;
      }

      if (initialBalance > 0 && balance < 0 && !hasShownLowBalanceAlert) {
        alertElement.textContent = 'Atenção: você já ultrapassou o saldo estabelecido!';
        alertElement.classList.add('active');
        hasShownLowBalanceAlert = true;
      } else if (initialBalance > 0 && balance <= initialBalance * 0.1 && balance >= 0 && !hasShownLowBalanceAlert) {
        alertElement.textContent = 'Atenção: Seu saldo está baixo. Restam menos de 10% do valor inicial.';
        alertElement.classList.add('active');
        hasShownLowBalanceAlert = true;
      } else if (balance > initialBalance * 0.1 || initialBalance === 0) {
        alertElement.classList.remove('active');
        alertElement.textContent = 'Atenção: Seu saldo está baixo. Restam menos de 10% do valor inicial.';
        hasShownLowBalanceAlert = false;
      }
      updateFooter();
    }

    function updateHistory() {
      const historyList = document.getElementById('historyList');
      if (!historyList) {
        console.error("Elemento de histórico não encontrado");
        return;
      }
      historyList.innerHTML = '';
      listHistory.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        const label = document.createElement('label');
        label.htmlFor = `history-${index}`;
        label.textContent = `${item.date}: ${item.name} - ${formatItemQuantity(item.quantity, item.unit)} x R$ ${item.price.toFixed(2).replace('.', ',')} = R$ ${item.total.toFixed(2).replace('.', ',')}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'historyItem';
        checkbox.id = `history-${index}`;
        checkbox.value = String(index);
        li.append(label, checkbox);
        historyList.appendChild(li);
      });
      updateMonthSelect();
    }

    function updateMonthSelect() {
      const monthSelect = document.getElementById('monthSelect');
      if (!monthSelect) {
        console.error("Elemento de seleção de mês não encontrado");
        return;
      }
      monthSelect.innerHTML = '<option value="">Selecione um mês</option>';
      const months = [...new Set(listHistory.map(item => {
        const date = new Date(item.date.split('/').reverse().join('-'));
        return date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      }))];
      months.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = month.charAt(0).toUpperCase() + month.slice(1);
        monthSelect.appendChild(option);
      });
    }

    function loadMonthHistory() {
      const monthSelect = document.getElementById('monthSelect');
      const targetListSelect = document.getElementById('targetListSelect');
      if (!monthSelect || !targetListSelect) {
        console.error("Elemento de seleção de mês ou lista de destino não encontrado");
        return;
      }
      const selectedMonth = monthSelect.value;
      const targetListName = targetListSelect.value;
      if (!selectedMonth) {
        alert('Por favor, selecione um mês.');
        return;
      }
      if (!targetListName) {
        alert('Por favor, selecione uma lista de destino.');
        return;
      }
      if (!lists[targetListName]) {
        console.error(`Lista de destino ${targetListName} não existe`);
        alert('Erro: A lista de destino não existe.');
        return;
      }
      const [monthName, year] = selectedMonth.split(' de ');
      const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      const monthIndex = monthNames.indexOf(monthName.toLowerCase());
      if (monthIndex === -1) {
        console.error(`Mês inválido: ${monthName}`);
        alert('Mês inválido selecionado.');
        return;
      }
      const filteredHistory = listHistory.filter(item => {
        const date = new Date(item.date.split('/').reverse().join('-'));
        return date.getMonth() === monthIndex && date.getFullYear() === parseInt(year);
      });
      let totalCost = 0;
      filteredHistory.forEach(item => {
        totalCost += item.total;
      });
      if (totalCost > lists[targetListName].balance) {
        if (!confirm(`O valor ultrapassa o saldo da lista "${targetListName}". Confirma inclusão dos itens? (Total: R$ ${totalCost.toFixed(2).replace('.', ',')} | Saldo: R$ ${lists[targetListName].balance.toFixed(2).replace('.', ',')})`)) {
          return;
        }
      }
      filteredHistory.forEach(item => {
        const newItem = { ...item, checked: false };
        lists[targetListName].items.push(newItem);
      });
      lists[targetListName].balance -= totalCost;
      try {
        saveLists();
      } catch (e) {
        console.error("Erro ao salvar listas no localStorage:", e);
      }
      
      // Se a lista de destino é a atual, atualiza a interface
      if (targetListName === currentListName) {
        shoppingList = lists[currentListName].items;
        updateList();
        updateTotal();
        updateBalance();
        updateFooter();
      }
      updateDashboard();
      monthSelect.value = '';
      targetListSelect.value = '';
      alert(`Itens do mês ${selectedMonth} carregados na lista "${targetListName}" com sucesso!`);
      console.log(`Histórico carregado na lista ${targetListName}`);
    }

    function compareWithPreviousMonth() {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const currentMonthItems = listHistory.filter(item => {
        const date = new Date(item.date.split('/').reverse().join('-'));
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      });

      const previousMonthItems = listHistory.filter(item => {
        const date = new Date(item.date.split('/').reverse().join('-'));
        return date.getMonth() === previousMonth && date.getFullYear() === previousYear;
      });

      const currentTotal = currentMonthItems.reduce((sum, item) => sum + item.total, 0);
      const previousTotal = previousMonthItems.reduce((sum, item) => sum + item.total, 0);

      const comparisonView = document.getElementById('comparisonView');
      const comparisonResult = document.getElementById('comparisonResult');
      if (!comparisonResult) {
        console.error("Elemento de resultado de comparação não encontrado");
        return;
      }
      comparisonResult.innerHTML = '';
      comparisonView.style.display = 'block';

      comparisonResult.innerHTML += `
        <p><strong>Total Gasto no Mês Atual (${now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}):</strong> R$ ${currentTotal.toFixed(2).replace('.', ',')}</p>
        <p><strong>Total Gasto no Mês Anterior (${new Date(previousYear, previousMonth).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}):</strong> R$ ${previousTotal.toFixed(2).replace('.', ',')}</p>
        <p><strong>Diferença:</strong> R$ ${(currentTotal - previousTotal).toFixed(2).replace('.', ',')} (${currentTotal > previousTotal ? 'mais' : currentTotal < previousTotal ? 'menos' : 'igual'})</p>
      `;

      const itemComparison = {};
      currentMonthItems.forEach(item => {
        if (!itemComparison[item.name]) {
          itemComparison[item.name] = { current: { price: 0, quantity: 0, total: 0 }, previous: { price: 0, quantity: 0, total: 0 } };
        }
        itemComparison[item.name].current.price = item.price;
        itemComparison[item.name].current.quantity += item.quantity;
        itemComparison[item.name].current.total += item.total;
      });

      previousMonthItems.forEach(item => {
        if (!itemComparison[item.name]) {
          itemComparison[item.name] = { current: { price: 0, quantity: 0, total: 0 }, previous: { price: 0, quantity: 0, total: 0 } };
        }
        itemComparison[item.name].previous.price = item.price;
        itemComparison[item.name].previous.quantity += item.quantity;
        itemComparison[item.name].previous.total += item.total;
      });

      const comparisonList = document.createElement('ul');
      Object.keys(itemComparison).forEach(name => {
        const current = itemComparison[name].current;
        const previous = itemComparison[name].previous;
        if (current.total > 0 || previous.total > 0) {
          const li = document.createElement('li');
          li.className = 'comparison-item';
          li.textContent = `${name}: Mês Atual - ${current.quantity} x R$ ${current.price.toFixed(2).replace('.', ',')} = R$ ${current.total.toFixed(2).replace('.', ',')} | Mês Anterior - ${previous.quantity} x R$ ${previous.price.toFixed(2).replace('.', ',')} = R$ ${previous.total.toFixed(2).replace('.', ',')} | Diferença - R$ ${(current.total - previous.total).toFixed(2).replace('.', ',')}`;
          comparisonList.appendChild(li);
        }
      });

      if (comparisonList.children.length > 0) {
        comparisonResult.appendChild(comparisonList);
      } else {
        comparisonResult.innerHTML += '<p>Nenhum item comum encontrado para comparação.</p>';
      }
    }

    function updateDivisionParticipants(options = {}) {
      const divisionEmails = document.getElementById('divisionEmails');
      const dividePeople = document.getElementById('dividePeople');
      const status = document.getElementById('divisionParticipantsStatus');
      if (!divisionEmails || !dividePeople || !status) {
        return;
      }

      const listChanged = options.listChanged === true
        || divisionEmails.dataset.listName !== selectedDivideListName;
      const currentUserEmail = (currentFirebaseUser && currentFirebaseUser.email || '').trim().toLowerCase();
      const automaticEmails = sharedListId && selectedDivideListName === currentListName
        ? currentSharedParticipantEmails.filter((email) => email && email !== currentUserEmail)
        : [];
      const existingEmails = listChanged ? [] : parseSharedEmails(divisionEmails.value);
      const combinedEmails = [...automaticEmails, ...existingEmails]
        .filter((email, index, collection) => email && collection.indexOf(email) === index);

      divisionEmails.dataset.listName = selectedDivideListName;
      divisionEmails.value = combinedEmails.join(', ');

      if (automaticEmails.length) {
        status.textContent = `${automaticEmails.length} colaborador(es) que acessaram esta lista foram adicionados automaticamente. Você pode incluir outros e-mails.`;
        if (listChanged || !dividePeople.value) {
          dividePeople.value = String(automaticEmails.length + 1);
        }
      } else if (sharedListId && selectedDivideListName === currentListName) {
        status.textContent = 'Ainda não há outros acessos registrados nesta lista. Você pode digitar os e-mails manualmente.';
      } else {
        status.textContent = 'Digite os e-mails dos participantes separados por vírgula.';
      }
    }

    function updateDivideListSelect() {
      const select = document.getElementById('divideListSelect');
      const selectedListSpan = document.getElementById('selectedDivideList');
      if (!select) {
        return;
      }

      const listNames = Object.keys(lists);
      if (!selectedDivideListName || !lists[selectedDivideListName]) {
        selectedDivideListName = lists[currentListName] ? currentListName : (listNames[0] || '');
      }

      select.innerHTML = '';
      listNames.forEach((listName) => {
        const option = document.createElement('option');
        option.value = listName;
        option.textContent = listName;
        option.selected = listName === selectedDivideListName;
        select.appendChild(option);
      });
      select.disabled = listNames.length === 0;
      if (selectedListSpan) {
        selectedListSpan.textContent = selectedDivideListName || 'Nenhuma lista selecionada';
      }
      updateDivisionParticipants();
    }

    function handleDivideListChange(event) {
      const selectedListName = event.target.value;
      if (!lists[selectedListName]) {
        return;
      }
      selectedDivideListName = selectedListName;
      const selectedListSpan = document.getElementById('selectedDivideList');
      const result = document.getElementById('divisionResult');
      const actions = document.getElementById('divisionShareActions');
      if (selectedListSpan) selectedListSpan.textContent = selectedListName;
      if (result) result.innerHTML = '';
      if (actions) {
        actions.innerHTML = '';
        actions.style.display = 'none';
      }
      updateDivisionParticipants({ listChanged: true });
    }

    function openDivideListDialog() {
      console.log("Tentando abrir diálogo de seleção de lista para divisão");
      const dialog = document.getElementById('divideListDialog');
      if (!dialog) {
        console.error("Elemento de diálogo 'divideListDialog' não encontrado");
        return;
      }
      const options = document.getElementById('divideListOptions');
      if (!options) {
        console.error("Elemento de opções de seleção de lista para divisão não encontrado");
        return;
      }
      options.innerHTML = '';
      Object.keys(lists).forEach(listName => {
        const li = document.createElement('li');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `divide-${listName}`;
        checkbox.name = 'divideList';
        checkbox.value = listName;
        if (listName === selectedDivideListName) {
          checkbox.checked = true;
        }
        const label = document.createElement('label');
        label.htmlFor = `divide-${listName}`;
        label.textContent = listName;
        li.appendChild(checkbox);
        li.appendChild(label);
        options.appendChild(li);
      });
      dialog.style.display = 'flex';
      console.log("Diálogo de seleção de lista para divisão aberto com sucesso");
    }

    function selectDivideList() {
      const checkboxes = document.querySelectorAll('input[name="divideList"]:checked');
      if (checkboxes.length === 0) {
        alert('Selecione pelo menos uma lista para divisão!');
        return;
      }
      if (checkboxes.length > 1) {
        alert('Selecione apenas uma lista por vez!');
        return;
      }
      const selectedListName = checkboxes[0].value;
      if (!lists[selectedListName]) {
        console.error(`Lista selecionada ${selectedListName} não existe`);
        alert('Erro: A lista selecionada não existe.');
        return;
      }
      selectedDivideListName = selectedListName;
      const selectedListSpan = document.getElementById('selectedDivideList');
      if (selectedListSpan) {
        selectedListSpan.textContent = selectedListName;
      }
      const divideListSelect = document.getElementById('divideListSelect');
      if (divideListSelect) divideListSelect.value = selectedListName;
      updateDivisionParticipants({ listChanged: true });
      closeDialog('divideListDialog');
      console.log("Lista selecionada para divisão:", selectedListName);
    }

    function calculateDivision() {
      const input = document.getElementById('dividePeople');
      const resultDiv = document.getElementById('divisionResult');
      const paymentMethod = document.getElementById('paymentMethod');
      const paymentDetails = document.getElementById('paymentDetails');
      const divisionEmails = document.getElementById('divisionEmails');
      const shareActions = document.getElementById('divisionShareActions');
      if (!input || !resultDiv || !paymentMethod || !paymentDetails || !divisionEmails || !shareActions) {
        console.error("Elemento de entrada ou resultado de divisão não encontrado");
        return;
      }
      shareActions.style.display = 'none';
      shareActions.innerHTML = '';
      const numPeople = parseInt(input.value) || 0;
      if (!selectedDivideListName) {
        resultDiv.innerHTML = '<p style="color: red;">Por favor, selecione uma lista.</p>';
        return;
      }
      if (numPeople <= 0) {
        resultDiv.innerHTML = '<p style="color: red;">Por favor, insira um número válido de pessoas (maior que 0).</p>';
        return;
      }
      const paymentDescription = paymentDetails.value.trim();
      if (!paymentDescription) {
        resultDiv.innerHTML = '<p style="color: red;">Informe a chave PIX ou os dados da conta para pagamento.</p>';
        return;
      }
      if (!lists[selectedDivideListName]) {
        console.error(`Lista selecionada ${selectedDivideListName} não existe`);
        resultDiv.innerHTML = '<p style="color: red;">Erro: A lista selecionada não existe.</p>';
        return;
      }
      const total = lists[selectedDivideListName].items.reduce((sum, item) => sum + item.total, 0);
      if (total === 0) {
        resultDiv.innerHTML = '<p style="color: red;">A lista selecionada não possui itens para dividir.</p>';
        return;
      }
      const perPerson = total / numPeople;
      const formattedTotal = total.toFixed(2).replace('.', ',');
      const formattedPerPerson = perPerson.toFixed(2).replace('.', ',');
      resultDiv.innerHTML = '';
      [
        `Lista: ${selectedDivideListName}`,
        `Total: R$ ${formattedTotal}`,
        `Dividido por ${numPeople} pessoas: R$ ${formattedPerPerson} por pessoa`,
      ].forEach((line) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        resultDiv.appendChild(paragraph);
      });
      const baseMessage = [
        `Divisão da lista ${selectedDivideListName}`,
        `Total da compra: R$ ${formattedTotal}`,
        `Divisão: ${numPeople} pessoas`,
        `Valor por pessoa: R$ ${formattedPerPerson}`,
        `${paymentMethod.value}: ${paymentDescription}`,
      ].join('\n');

      const title = document.createElement('h3');
      title.textContent = 'Enviar cobrança';
      const help = document.createElement('p');
      help.textContent = 'Escolha uma pessoa para abrir o WhatsApp com a mensagem pronta.';
      const personActions = document.createElement('div');
      personActions.className = 'division-person-actions';

      for (let person = 1; person <= numPeople; person += 1) {
        const link = document.createElement('a');
        const message = `Olá! Esta é a sua parte da compra.\n\n${baseMessage}`;
        link.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `Enviar para pessoa ${person}`;
        personActions.appendChild(link);
      }

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.textContent = 'Copiar mensagem de cobrança';
      copyButton.addEventListener('click', () => {
        copyTextToClipboard(baseMessage).then(() => {
          copyButton.textContent = 'Mensagem copiada!';
        }).catch(() => {
          alert('Não foi possível copiar automaticamente. Tente novamente.');
        });
      });

      const emailButton = document.createElement('button');
      emailButton.type = 'button';
      emailButton.className = 'division-email-button';
      emailButton.textContent = 'Enviar cobranças por e-mail';
      emailButton.addEventListener('click', () => {
        const emails = parseSharedEmails(divisionEmails.value);
        if (!emails.length) {
          alert('Informe pelo menos um e-mail válido dos participantes.');
          return;
        }
        sendDivisionEmails({
          emails,
          listName: selectedDivideListName,
          total,
          perPerson,
          peopleCount: numPeople,
          paymentMethod: paymentMethod.value,
          paymentDetails: paymentDescription,
        }, emailButton);
      });

      shareActions.appendChild(title);
      shareActions.appendChild(help);
      shareActions.appendChild(personActions);
      shareActions.appendChild(copyButton);
      shareActions.appendChild(emailButton);
      shareActions.style.display = 'grid';
      console.log(`Divisão calculada: Total R$ ${total.toFixed(2)} / ${numPeople} = R$ ${perPerson.toFixed(2)} por pessoa`);
    }

    function copyTextToClipboard(text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      const temporaryInput = document.createElement('textarea');
      temporaryInput.value = text;
      temporaryInput.style.position = 'fixed';
      temporaryInput.style.opacity = '0';
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      const copied = document.execCommand('copy');
      temporaryInput.remove();
      return copied ? Promise.resolve() : Promise.reject(new Error('Falha ao copiar'));
    }

    function showFinishSharingDialog() {
      if (!sharedListId || !currentFirebaseUser || currentSharedOwnerId !== currentFirebaseUser.uid || sharedListEnded) {
        return;
      }
      const dialog = document.getElementById('finishSharingDialog');
      const status = document.getElementById('finishSharingStatus');
      if (status) status.textContent = '';
      if (dialog) dialog.style.display = 'flex';
    }

    function finalizeSharing(shouldDivide) {
      const status = document.getElementById('finishSharingStatus');
      const finishAndDivideButton = document.getElementById('finishAndDivideButton');
      const finishWithoutDivisionButton = document.getElementById('finishWithoutDivisionButton');
      if (!remoteListReference || !currentFirebaseUser || currentSharedOwnerId !== currentFirebaseUser.uid) {
        if (status) status.textContent = 'Somente o proprietário pode finalizar o compartilhamento.';
        return;
      }

      if (status) status.textContent = 'Finalizando o acesso dos colaboradores...';
      finishingSharing = true;
      if (finishAndDivideButton) finishAndDivideButton.disabled = true;
      if (finishWithoutDivisionButton) finishWithoutDivisionButton.disabled = true;
      const ownerEmail = (currentFirebaseUser.email || '').toLowerCase();

      // Precisa terminar ANTES do update abaixo: a rota lê quem tinha
      // acesso pra avisar por e-mail, e o update seguinte já zera
      // allowedEmails. Falha no envio não impede a finalização em si —
      // só não deixa a leitura da rota disputar com a escrita do update.
      authenticatedEmailRequest('/api/email/share-ended', { listId: sharedListId })
        .catch((error) => console.warn('Não foi possível avisar os colaboradores por e-mail.', error))
        .then(() => remoteListReference.update({
          allowedEmails: ownerEmail ? [ownerEmail] : [],
          linkAccess: false,
          sharingEnded: true,
          endedBy: currentFirebaseUser.uid,
          endedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        })).then(() => {
        sharedListEnded = true;
        allowEndedSharedDivision = shouldDivide;
        clearRememberedSharedList(sharedListId);
        closeDialog('finishSharingDialog');
        updateSharedModeUi();
        if (shouldDivide) {
          selectedDivideListName = currentListName;
          const selectedListSpan = document.getElementById('selectedDivideList');
          if (selectedListSpan) selectedListSpan.textContent = currentListName;
          showSection('divideSection');
        } else {
          openPrivateLists();
        }
      }).catch((error) => {
        finishingSharing = false;
        allowEndedSharedDivision = false;
        console.error('Não foi possível finalizar o compartilhamento.', error);
        if (status) status.textContent = 'Não foi possível finalizar. Verifique sua conexão e tente novamente.';
      }).finally(() => {
        finishingSharing = false;
        if (finishAndDivideButton) finishAndDivideButton.disabled = false;
        if (finishWithoutDivisionButton) finishWithoutDivisionButton.disabled = false;
      });
    }

    function parseSharedEmails(rawEmails) {
      if (!rawEmails || typeof rawEmails !== 'string') {
        return [];
      }
      return rawEmails
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    }

    async function authenticatedEmailRequest(endpoint, payload) {
      if (!currentFirebaseUser) {
        throw new Error('Faça login para enviar e-mails.');
      }
      const [token, appCheckToken] = await Promise.all([
        currentFirebaseUser.getIdToken(),
        getFirebaseAppCheckToken(),
      ]);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Firebase-AppCheck': appCheckToken,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(response.status === 503
          ? 'O envio por e-mail ainda precisa ser configurado.'
          : 'Não foi possível enviar o e-mail agora.');
        error.configurationPending = response.status === 503 || result.configurationPending;
        throw error;
      }
      return result;
    }

    async function sendShareInvitationEmails(listId, listName, emails) {
      if (!emails.length) return { sent: 0 };
      return authenticatedEmailRequest('/api/email/share-invite', {
        listId,
        listName,
        emails,
      });
    }

    async function sendDivisionEmails(payload, button) {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Enviando cobranças...';
      try {
        const result = await authenticatedEmailRequest('/api/email/division', payload);
        button.textContent = `${result.sent || payload.emails.length} cobrança(s) enviada(s)!`;
      } catch (error) {
        button.textContent = error.configurationPending ? 'E-mail aguardando configuração' : originalText;
        alert(error.message || 'Não foi possível enviar as cobranças por e-mail.');
      } finally {
        button.disabled = false;
      }
    }

    function showShareError(error) {
      const shareErrorMessage = document.getElementById('shareErrorMessage');
      const errorMessage = error && (error.message || error.code || error.toString())
        ? (error.message || error.code || error.toString())
        : 'Não foi possível concluir o compartilhamento.';
      if (shareErrorMessage) {
        shareErrorMessage.style.display = 'block';
        shareErrorMessage.textContent = errorMessage;
      }
    }

    function configureShareDialogForOwner(isOwner) {
      const shareEmailInput = document.getElementById('shareEmailInput');
      const shareLinkToggle = document.getElementById('shareLinkToggle');
      const saveButton = document.getElementById('saveShareSettingsButton');
      const emailButton = document.getElementById('sendShareEmailButton');
      if (shareEmailInput) shareEmailInput.disabled = !isOwner;
      if (shareLinkToggle) shareLinkToggle.disabled = !isOwner;
      if (saveButton) saveButton.style.display = isOwner ? '' : 'none';
      if (emailButton) emailButton.style.display = isOwner ? '' : 'none';
    }

    function showShareDialog() {
      const dialog = document.getElementById('shareListDialog');
      const shareListName = document.getElementById('shareListName');
      const shareEmailInput = document.getElementById('shareEmailInput');
      const shareLinkToggle = document.getElementById('shareLinkToggle');
      const shareLink = document.getElementById('shareLink');
      const copyButton = document.getElementById('copyShareLinkButton');
      const saveButton = document.getElementById('saveShareSettingsButton');
      const emailButton = document.getElementById('sendShareEmailButton');
      const shareErrorMessage = document.getElementById('shareErrorMessage');

      if (!dialog || !shareListName || !shareEmailInput || !shareLinkToggle || !shareLink || !copyButton || !saveButton || !emailButton) {
        return;
      }
      if (!currentFirebaseUser || !firebaseAuth) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      if (!sharedListId && !currentPlanLimits().canShare) {
        alert('Assine o plano Cesta ou Cestão para compartilhar listas.');
        return;
      }
      if (!firestoreDb) {
        showShareError(new Error('A sincronização ainda não está disponível. Recarregue a página.'));
        return;
      }

      shareListName.textContent = currentListName;
      shareEmailInput.value = '';
      shareLinkToggle.checked = true;
      shareLink.value = '';
      copyButton.disabled = true;
      saveButton.disabled = false;
      emailButton.disabled = false;
      saveButton.textContent = sharedListId ? 'Atualizar link' : 'Gerar link';
      emailButton.textContent = 'Enviar por e-mail';
      configureShareDialogForOwner(!sharedListId || currentSharedOwnerId === currentFirebaseUser.uid);
      if (shareErrorMessage) {
        shareErrorMessage.style.display = 'none';
        shareErrorMessage.textContent = '';
      }

      pendingShareDocumentReference = sharedListId
        ? firestoreDb.collection('sharedLists').doc(sharedListId)
        : firestoreDb.collection('sharedLists').doc();
      dialog.style.display = 'flex';

      if (!sharedListId) {
        return;
      }

      pendingShareDocumentReference.get().then((snapshot) => {
        if (!snapshot.exists) {
          throw new Error('A lista compartilhada não existe mais.');
        }
        const data = snapshot.data() || {};
        currentSharedOwnerId = data.owner || null;
        const isOwner = currentSharedOwnerId === currentFirebaseUser.uid;
        configureShareDialogForOwner(isOwner);
        const currentUserEmail = (currentFirebaseUser.email || '').toLowerCase();
        shareEmailInput.value = Array.isArray(data.allowedEmails)
          ? data.allowedEmails.filter((email) => email !== currentUserEmail).join(', ')
          : '';
        shareLinkToggle.checked = data.linkAccess !== false;
        shareLink.value = `${window.location.origin}${window.location.pathname}?sharedList=${sharedListId}`;
        copyButton.disabled = false;
      }).catch(showShareError);
    }

    function saveShareSettings(shouldSendInvitations = false) {
      const shareEmailInput = document.getElementById('shareEmailInput');
      const shareLinkToggle = document.getElementById('shareLinkToggle');
      const shareLink = document.getElementById('shareLink');
      const copyButton = document.getElementById('copyShareLinkButton');
      const saveButton = document.getElementById('saveShareSettingsButton');
      const emailButton = document.getElementById('sendShareEmailButton');
      const shareErrorMessage = document.getElementById('shareErrorMessage');
      if (!pendingShareDocumentReference || !currentFirebaseUser || !shareEmailInput || !shareLinkToggle || !shareLink || !copyButton || !saveButton || !emailButton) {
        return;
      }

      if (shareErrorMessage) {
        shareErrorMessage.style.display = 'none';
        shareErrorMessage.textContent = '';
      }

      saveButton.disabled = true;
      emailButton.disabled = true;
      const ownerEmail = (currentFirebaseUser.email || '').toLowerCase();
      const allowedEmails = [ownerEmail, ...parseSharedEmails(shareEmailInput.value)]
        .filter((email, index, collection) => email && collection.indexOf(email) === index);
      const invitationEmails = allowedEmails.filter((email) => email !== ownerEmail);

      if (invitationEmails.length > 20) {
        saveButton.disabled = false;
        emailButton.disabled = false;
        showShareError(new Error('Você pode convidar no máximo 20 e-mails por lista.'));
        return;
      }
      if (shouldSendInvitations && !invitationEmails.length) {
        saveButton.disabled = false;
        emailButton.disabled = false;
        showShareError(new Error('Digite pelo menos um e-mail válido para enviar o convite.'));
        return;
      }

      if (shouldSendInvitations) {
        emailButton.textContent = 'Preparando envio...';
      } else {
        saveButton.textContent = 'Gerando link...';
      }

      const isExistingShare = Boolean(sharedListId);
      const selectedList = normalizeListData(lists[currentListName]);
      const selectedLists = { [currentListName]: selectedList };
      const metadata = {
        allowedEmails,
        linkAccess: shareLinkToggle.checked,
        sharingEnded: false,
        endedAt: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      const writePromise = isExistingShare
        ? pendingShareDocumentReference.update(metadata)
        : pendingShareDocumentReference.set({
            ...metadata,
            lists: selectedLists,
            currentListName,
            owner: currentFirebaseUser.uid,
            ownerEmail: currentFirebaseUser.email || '',
            lastEditedBy: cleanText(currentFirebaseUser.displayName || currentFirebaseUser.email, 80, 'Usuário GetGoList'),
            lastEditedByEmail: cleanText(currentFirebaseUser.email, 254),
            lastEditedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });

      writePromise.then(async () => {
        if (!isExistingShare) {
          currentSharedOwnerId = currentFirebaseUser.uid;
          applyRemoteLists(selectedLists, currentListName);
          shareLink.value = activateSharedList(
            pendingShareDocumentReference,
            pendingShareDocumentReference.id,
            selectedLists
          );
        } else {
          shareLink.value = `${window.location.origin}${window.location.pathname}?sharedList=${sharedListId}`;
        }
        copyButton.disabled = false;
        if (!shouldSendInvitations) {
          saveButton.textContent = isExistingShare ? 'Link atualizado!' : 'Link gerado!';
          saveButton.disabled = false;
          emailButton.disabled = false;
          return;
        }
        emailButton.textContent = 'Enviando convites...';
        try {
          const emailResult = await sendShareInvitationEmails(
            pendingShareDocumentReference.id,
            currentListName,
            invitationEmails,
          );
          emailButton.textContent = `${emailResult.sent || invitationEmails.length} convite(s) enviado(s)!`;
        } catch (emailError) {
          console.error('O compartilhamento foi salvo, mas os convites não foram enviados.', emailError);
          emailButton.textContent = emailError.configurationPending
            ? 'E-mail aguardando configuração'
            : 'Falha no envio por e-mail';
        }
        saveButton.disabled = false;
        emailButton.disabled = false;
      }).catch((error) => {
        saveButton.disabled = false;
        emailButton.disabled = false;
        saveButton.textContent = isExistingShare ? 'Atualizar link' : 'Gerar link';
        emailButton.textContent = 'Enviar por e-mail';
        showShareError(error);
      });
    }

    function openListNavigationDialog() {
      console.log("Abrindo diálogo de navegação de listas");
      const dialog = document.getElementById('listNavigationDialog');
      if (!dialog) {
        console.error("Elemento de diálogo 'listNavigationDialog' não encontrado");
        return;
      }
      const options = document.getElementById('listNavigationOptions');
      if (!options) {
        console.error("Elemento de opções de navegação de lista não encontrado");
        return;
      }
      options.innerHTML = '';
      Object.keys(lists).forEach(listName => {
        const li = document.createElement('li');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = `nav-${listName}`;
        radio.name = 'navigationList';
        radio.value = listName;
        if (listName === currentListName) {
          radio.checked = true;
        }
        const label = document.createElement('label');
        label.htmlFor = `nav-${listName}`;
        label.textContent = `${listName} (${lists[listName].items.length} itens)`;
        li.appendChild(radio);
        li.appendChild(label);
        options.appendChild(li);
      });
      dialog.style.display = 'flex';
      console.log("Diálogo de navegação de listas aberto com sucesso");
    }

    function navigateToSelectedList() {
      const radio = document.querySelector('input[name="navigationList"]:checked');
      if (!radio) {
        alert('Selecione uma lista para navegar!');
        return;
      }
      const selectedListName = radio.value;
      if (!lists[selectedListName]) {
        console.error(`Lista selecionada ${selectedListName} não existe`);
        alert('Erro: A lista selecionada não existe.');
        return;
      }
      currentListName = selectedListName;
      shoppingList = lists[currentListName].items;
      listHistory = lists[currentListName].history;
      allSelected = false;
      updateList();
      updateTotal();
      updateBalance();
      updateMonthSelect();
      updateFooter();
      updateDashboard();
      setupListButtons();
      closeDialog('listNavigationDialog');
      showSection('productsSection');
      console.log("Navegado para lista:", currentListName);
    }

    function updateTargetListSelect() {
      const targetListSelect = document.getElementById('targetListSelect');
      if (!targetListSelect) {
        console.error("Elemento de seleção de lista de destino não encontrado");
        return;
      }
      targetListSelect.innerHTML = '<option value="">Selecione uma lista</option>';
      Object.keys(lists).forEach(listName => {
        const option = document.createElement('option');
        option.value = listName;
        option.textContent = listName;
        if (listName === currentListName) {
          option.selected = true;
        }
        targetListSelect.appendChild(option);
      });
    }

    function copyShareLink() {
      const shareLink = document.getElementById('shareLink');
      if (!shareLink) {
        console.error("Elemento de link de compartilhamento não encontrado");
        return;
      }
      shareLink.select();
      try {
        document.execCommand('copy');
        alert('Link copiado para a área de transferência!');
        console.log("Link de compartilhamento copiado com sucesso");
      } catch (e) {
        console.error("Erro ao copiar link:", e);
        alert('Erro ao copiar o link. Por favor, copie manualmente.');
      }
    }

    function selectList(listName) {
      if (!lists[listName]) return;
      currentListName = listName;
      shoppingList = lists[currentListName].items;
      listHistory = lists[currentListName].history;
      allSelected = false;
      populateSectorSelect();
      updateList();
      updateTotal();
      updateBalance();
      updateMonthSelect();
      updateFooter();
      updateDashboard();
      setupListButtons();
    }

    function setupListButtons() {
      const currentListSelect = document.getElementById('currentListSelect');
      const currentListHeading = document.getElementById('currentListHeading');
      if (!currentListSelect) return;

      currentListSelect.innerHTML = '';
      Object.keys(lists).forEach(listName => {
        const option = document.createElement('option');
        option.value = listName;
        option.textContent = `${listName} (${lists[listName].items.length} itens)`;
        option.selected = listName === currentListName;
        currentListSelect.appendChild(option);
      });

      if (currentListHeading) currentListHeading.textContent = currentListName;
      currentListSelect.onchange = () => {
        selectList(currentListSelect.value);
      };
    }

    function renderHomeLists() {
      const grid = document.getElementById('homeListsGrid');
      if (!grid) return;
      grid.replaceChildren();

      if (sharedListId) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'home-list-card';
        const itemCount = Array.isArray(shoppingList) ? shoppingList.length : 0;
        card.innerHTML = `
          <span class="badge">Compartilhada</span>
          <h3></h3>
          <p></p>
        `;
        card.querySelector('h3').textContent = currentListName;
        card.querySelector('p').textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'itens'} · em colaboração`;
        card.addEventListener('click', () => showSection('productsSection'));
        grid.appendChild(card);

        const backCard = document.createElement('button');
        backCard.type = 'button';
        backCard.className = 'home-list-card new-list';
        backCard.textContent = '← Minhas listas';
        backCard.addEventListener('click', openPrivateLists);
        grid.appendChild(backCard);
        return;
      }

      const ownListNames = Object.keys(lists);
      if (!ownListNames.length && !knownSharedLists.length) {
        const empty = document.createElement('div');
        empty.className = 'home-lists-empty';
        empty.textContent = 'Você ainda não tem listas. Crie a primeira em segundos.';
        grid.appendChild(empty);
      }

      ownListNames.slice(0, 5).forEach((listName) => {
        const list = lists[listName];
        const itemCount = Array.isArray(list.items) ? list.items.length : 0;
        const balance = typeof list.balance === 'number' ? list.balance : 0;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'home-list-card';
        card.innerHTML = '<h3></h3><p></p>';
        card.querySelector('h3').textContent = listName;
        card.querySelector('p').textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'itens'} · saldo R$ ${balance.toFixed(2).replace('.', ',')}`;
        card.addEventListener('click', () => {
          selectList(listName);
          showSection('productsSection');
        });
        grid.appendChild(card);
      });

      knownSharedLists.slice(0, 4).forEach((sharedList) => {
        if (!sharedList || !sharedList.id || !sharedList.name) return;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'home-list-card';
        card.innerHTML = '<span class="badge">Compartilhada</span><h3></h3><p>Toque para abrir</p>';
        card.querySelector('h3').textContent = sharedList.name;
        card.addEventListener('click', () => {
          window.location.assign(`/index.html?sharedList=${encodeURIComponent(sharedList.id)}`);
        });
        grid.appendChild(card);
      });

      const newListCard = document.createElement('button');
      newListCard.type = 'button';
      newListCard.className = 'home-list-card new-list';
      newListCard.textContent = '+ Nova lista';
      newListCard.addEventListener('click', createNewListDialog);
      grid.appendChild(newListCard);
    }

    function createNewListDialog() {
      console.log("Tentando abrir diálogo de criação de lista");
      const dialog = document.getElementById('createListDialog');
      if (!dialog) {
        console.error("Elemento de diálogo 'createListDialog' não encontrado");
        return;
      }
      dialog.style.display = 'flex';
      const input = document.getElementById('newListName');
      const budgetInput = document.getElementById('newListBalance');
      if (input) {
        input.value = '';
        if (budgetInput) budgetInput.value = '';
        console.log("Diálogo de criação de lista aberto com sucesso");
      } else {
        console.error("Elemento de entrada 'newListName' não encontrado");
      }
    }

    function createNewList() {
      const input = document.getElementById('newListName');
      const budgetInput = document.getElementById('newListBalance');
      if (!input || !budgetInput) {
        console.error("Elemento de entrada 'newListName' não encontrado");
        return;
      }
      if (Object.keys(lists).length >= currentPlanLimits().maxLists) {
        alert('Seu plano atual atingiu o limite de listas. Assine um plano com mais listas para continuar.');
        return;
      }
      const newName = safeListName(input.value, '');
      const initialBudget = parsePrice(budgetInput.value);
      if (newName && !lists[newName]) {
        lists[newName] = {
          items: [],
          history: [],
          balance: initialBudget,
          initialBalance: initialBudget,
        };
        currentListName = newName;
        shoppingList = lists[newName].items;
        listHistory = lists[newName].history;
        selectedDivideListName = newName;
        try {
          saveLists();
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        closeDialog('createListDialog');
        setupListButtons();
        updateList();
        updateTotal();
        updateBalance();
        updateFooter();
        updateDashboard();
        showSection('productsSection');
        console.log("Nova lista criada:", newName);
      } else if (newName) {
        alert('Nome já existe ou é inválido!');
      } else {
        alert('Por favor, insira um nome válido para a lista.');
      }
    }

    function deleteListDialog() {
      console.log("Tentando abrir diálogo de exclusão de lista");
      const dialog = document.getElementById('deleteListDialog');
      if (!dialog) {
        console.error("Elemento de diálogo 'deleteListDialog' não encontrado");
        return;
      }
      const options = document.getElementById('deleteListOptions');
      if (!options) {
        console.error("Elemento de opções de exclusão de lista não encontrado");
        return;
      }
      options.innerHTML = '';

      const fragment = document.createDocumentFragment();
      Object.keys(lists).forEach(listName => {
        const li = document.createElement('li');
        li.className = 'dialog-list-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `delete-${listName}`;
        checkbox.name = 'deleteList';
        checkbox.value = listName;

        const label = document.createElement('label');
        label.htmlFor = `delete-${listName}`;
        label.textContent = listName;

        li.appendChild(checkbox);
        li.appendChild(label);
        fragment.appendChild(li);
      });
      options.appendChild(fragment);

      dialog.style.display = 'flex';
      console.log("Diálogo de exclusão de lista aberto com sucesso");
    }

    function selectAllDeleteLists() {
      const checkboxes = document.querySelectorAll('input[name="deleteList"]');
      if (!checkboxes.length) {
        return;
      }
      checkboxes.forEach(checkbox => {
        checkbox.checked = true;
      });
      console.log('Todas as listas no diálogo de exclusão foram selecionadas');
    }

    function deleteSelectedLists() {
      const checkboxes = document.querySelectorAll('input[name="deleteList"]:checked');
      if (checkboxes.length === 0) {
        alert('Selecione pelo menos uma lista para excluir!');
        return;
      }
      if (checkboxes.length === Object.keys(lists).length) {
        closeDialog('deleteListDialog');
        const confirmDialog = document.getElementById('deleteAllConfirmDialog');
        if (confirmDialog) {
          confirmDialog.style.display = 'flex';
        }
        return;
      }
      const selectedListNames = Array.from(checkboxes).map((checkbox) => checkbox.value);
      const listDescription = selectedListNames.length === 1
        ? `a lista “${selectedListNames[0]}”`
        : `as ${selectedListNames.length} listas selecionadas`;
      if (!confirm(`Deseja realmente excluir ${listDescription}? Esta ação não pode ser desfeita.`)) {
        return;
      }
      let currentWasDeleted = false;
      let divideListWasDeleted = false;
      checkboxes.forEach(checkbox => {
        const listName = checkbox.value;
        console.log("Excluindo lista:", listName);
        if (listName === currentListName) currentWasDeleted = true;
        if (listName === selectedDivideListName) divideListWasDeleted = true;
        clearRememberedSharedListByName(listName);
        delete lists[listName];
      });
      if (currentWasDeleted && Object.keys(lists).length > 0) {
        currentListName = Object.keys(lists)[0];
        console.log("Trocado para nova lista atual:", currentListName);
      } else if (Object.keys(lists).length === 0) {
        console.warn("Nenhuma lista restante após exclusão. Criando lista padrão.");
        currentListName = "Lista 1";
        lists[currentListName] = { items: [], history: [], balance: 0, initialBalance: 0 };
      }
      if (divideListWasDeleted) {
        selectedDivideListName = '';
        const selectedListSpan = document.getElementById('selectedDivideList');
        if (selectedListSpan) {
          selectedListSpan.textContent = 'Nenhuma lista selecionada';
        }
      }
      shoppingList = lists[currentListName].items;
      listHistory = lists[currentListName].history;
      try {
        saveLists();
      } catch (e) {
        console.error("Erro ao salvar listas no localStorage:", e);
      }
      closeDialog('deleteListDialog');
      setupListButtons();
      updateList();
      updateTotal();
      updateBalance();
      updateMonthSelect();
      updateFooter();
      updateDashboard();
      console.log("Listas selecionadas excluídas com sucesso");
    }

    function confirmDeleteAllLists() {
      const checkboxes = document.querySelectorAll('input[name="deleteList"]:checked');
      if (!checkboxes.length) {
        closeDialog('deleteAllConfirmDialog');
        return;
      }
      let currentWasDeleted = false;
      let divideListWasDeleted = false;
      checkboxes.forEach(checkbox => {
        const listName = checkbox.value;
        console.log("Excluindo lista:", listName);
        if (listName === currentListName) currentWasDeleted = true;
        if (listName === selectedDivideListName) divideListWasDeleted = true;
        clearRememberedSharedListByName(listName);
        delete lists[listName];
      });
      if (currentWasDeleted && Object.keys(lists).length > 0) {
        currentListName = Object.keys(lists)[0];
        console.log("Trocado para nova lista atual:", currentListName);
      } else if (Object.keys(lists).length === 0) {
        console.warn("Nenhuma lista restante após exclusão. Criando lista padrão.");
        currentListName = "Lista 1";
        lists[currentListName] = { items: [], history: [], balance: 0, initialBalance: 0 };
      }
      if (divideListWasDeleted) {
        selectedDivideListName = '';
        const selectedListSpan = document.getElementById('selectedDivideList');
        if (selectedListSpan) {
          selectedListSpan.textContent = 'Nenhuma lista selecionada';
        }
      }
      shoppingList = lists[currentListName].items;
      listHistory = lists[currentListName].history;
      try {
        saveLists();
      } catch (e) {
        console.error("Erro ao salvar listas no localStorage:", e);
      }
      closeDialog('deleteAllConfirmDialog');
      setupListButtons();
      updateList();
      updateTotal();
      updateBalance();
      updateMonthSelect();
      updateFooter();
      updateDashboard();
      console.log("Todas as listas excluídas com sucesso");
    }

    function editListNamesDialog() {
      console.log("Tentando abrir diálogo de edição de nomes");
      const dialog = document.getElementById('editListDialog');
      if (!dialog) {
        console.error("Elemento de diálogo 'editListDialog' não encontrado");
        return;
      }
      const options = document.getElementById('editListOptions');
      if (!options) {
        console.error("Elemento de opções de edição de lista não encontrado");
        return;
      }
      options.innerHTML = '';
      const nameInputs = {};
      Object.keys(lists).forEach(listName => {
        const li = document.createElement('li');
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 80;
        input.value = listName;
        nameInputs[listName] = input;
        li.appendChild(input);
        options.appendChild(li);
      });
      dialog.style.display = 'flex';
      window.nameInputs = nameInputs;
      console.log("Diálogo de edição de nomes aberto com sucesso");
    }

    function saveListNames() {
      const newNames = {};
      let hasConflict = false;
      Object.keys(window.nameInputs).forEach(oldName => {
        const newName = safeListName(window.nameInputs[oldName].value, '');
        if (newName && !newNames[newName] && newName !== oldName) {
          newNames[newName] = lists[oldName];
          if (currentListName === oldName) currentListName = newName;
          if (selectedDivideListName === oldName) selectedDivideListName = newName;
        } else if (newName && newName !== oldName) {
          hasConflict = true;
        } else {
          newNames[oldName] = lists[oldName];
        }
      });
      if (hasConflict) {
        alert('Nomes duplicados ou inválidos detectados! Certifique-se de que todos os nomes sejam únicos.');
      } else {
        lists = newNames;
        if (!lists[currentListName]) {
          console.warn(`Lista atual "${currentListName}" não encontrada após renomeação. Redefinindo para a primeira lista disponível.`);
          currentListName = Object.keys(lists)[0] || "Lista 1";
          if (!lists[currentListName]) {
            lists[currentListName] = { items: [], history: [], balance: 0, initialBalance: 0 };
            console.log(`Criada lista padrão: ${currentListName}`);
          }
        }
        shoppingList = lists[currentListName].items;
        listHistory = lists[currentListName].history;
        const selectedDivideListSpan = document.getElementById('selectedDivideList');
        if (selectedDivideListSpan) {
          selectedDivideListSpan.textContent = selectedDivideListName || 'Nenhuma lista selecionada';
        }
        try {
          saveLists();
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        closeDialog('editListDialog');
        setupListButtons();
        updateList();
        updateFooter();
        updateDashboard();
        console.log("Nomes das listas salvos com sucesso");
      }
    }

    function closeDialog(dialogId) {
      const dialog = document.getElementById(dialogId);
      if (dialog) {
        dialog.style.display = 'none';
        console.log(`Diálogo ${dialogId} fechado`);
      } else {
        console.error(`Elemento de diálogo ${dialogId} não encontrado`);
      }
    }

    function setupDialogOverlayClose() {
      document.querySelectorAll('.dialog').forEach(dialog => {
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog) {
            dialog.style.display = 'none';
            console.log(`Diálogo ${dialog.id} fechado por clique fora`);
          }
        });
      });
    }

    function setupEventHandlers() {
      const menuToggle = document.getElementById('menuToggle');
      const navRailToggle = document.getElementById('navRailToggle');
      const overlay = document.getElementById('overlay');
      const accountAction = document.getElementById('accountAction');
      const photoFileInput = document.getElementById('photoFileInput');
      const itemPrice = document.getElementById('itemPrice');
      const itemUnit = document.getElementById('itemUnit');
      const itemQuantity = document.getElementById('itemQuantity');
      const balanceInput = document.getElementById('balanceInput');
      const newListBalance = document.getElementById('newListBalance');
      const aiPreviewBudget = document.getElementById('aiPreviewBudget');

      if (menuToggle) {
        menuToggle.addEventListener('click', toggleMenu);
      }
      if (navRailToggle) {
        navRailToggle.addEventListener('click', () => {
          setCompactNavCollapsed(!document.body.classList.contains('nav-collapsed'));
        });
      }
      if (overlay) {
        overlay.addEventListener('click', closeMenu);
      }
      if (accountAction) {
        accountAction.addEventListener('click', () => {
          handleAccountAction();
          closeAccountMenu();
        });
      }
      const sidebarAccountTrigger = document.getElementById('sidebarAccountTrigger');
      const accountDropdownProfileButton = document.getElementById('accountDropdownProfileButton');
      if (sidebarAccountTrigger) {
        sidebarAccountTrigger.addEventListener('click', (event) => {
          event.stopPropagation();
          toggleAccountMenu();
        });
      }
      if (accountDropdownProfileButton) {
        accountDropdownProfileButton.addEventListener('click', () => {
          closeAccountMenu();
          handleSidebarNavClick(() => showSection('profileSection'));
        });
      }
      document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('accountDropdown');
        const trigger = document.getElementById('sidebarAccountTrigger');
        if (!dropdown || !dropdown.classList.contains('open')) {
          return;
        }
        if (!dropdown.contains(event.target) && (!trigger || !trigger.contains(event.target))) {
          closeAccountMenu();
        }
      });
      window.addEventListener('resize', () => {
        const dropdown = document.getElementById('accountDropdown');
        if (dropdown && dropdown.classList.contains('open')) {
          positionAccountDropdown();
        }
      });
      if (photoFileInput) {
        photoFileInput.addEventListener('change', handlePhotoFileSelect);
      }
      if (itemPrice) {
        itemPrice.addEventListener('input', function () {
          formatPrice(this);
        });
      }
      if (itemUnit) {
        itemUnit.addEventListener('change', () => updateItemUnitStep(itemQuantity, itemUnit.value));
      }
      if (balanceInput) {
        balanceInput.addEventListener('input', function () {
          formatPrice(this);
        });
      }
      if (newListBalance) {
        newListBalance.addEventListener('input', function () {
          formatPrice(this);
        });
      }
      if (aiPreviewBudget) {
        aiPreviewBudget.addEventListener('input', function () {
          formatPrice(this);
        });
      }
      const setBalanceButton = document.getElementById('setBalanceButton');
      const addItemButton = document.getElementById('addItemButton');
      const itemSectorSelect = document.getElementById('itemSector');
      const createSectorButton = document.getElementById('createSectorButton');
      const closeCreateSectorDialogButton = document.getElementById('closeCreateSectorDialogButton');
      const newSectorName = document.getElementById('newSectorName');
      const triggerPhotoUpload = document.getElementById('triggerPhotoUpload');
      const profileAvatar = document.getElementById('profileAvatar');
      const shareButton = document.querySelector('.share-button');
      const homeButton = document.querySelector('.home-button');
      const managementButton = document.querySelector('.management-button');
      const shoppingButton = document.querySelector('.shopping-button');
      const productsButton = document.querySelector('.products-button');
      const historyButton = document.querySelector('.history-button');
      const divideButton = document.querySelector('.divide-button');
      const openListNavigationStat = document.getElementById('openListNavigationStat');
      const openBudgetDialogButton = document.getElementById('openBudgetDialogButton');
      const manageListsButton = document.getElementById('manageListsButton');
      const openProductsFromListsButton = document.getElementById('openProductsFromListsButton');
      const openCreateListDialogButton = document.getElementById('openCreateListDialogButton');
      const openDeleteListDialogButton = document.getElementById('openDeleteListDialogButton');
      const openEditListNamesDialogButton = document.getElementById('openEditListNamesDialogButton');
      const toggleSelectAllButton = document.getElementById('toggleSelectAllButton');
      const moveSelectedListItemsButton = document.getElementById('moveSelectedListItemsButton');
      const deleteSelectedListItemsButton = document.getElementById('deleteSelectedListItemsButton');
      const confirmMoveSelectedItemsButton = document.getElementById('confirmMoveSelectedItemsButton');
      const closeMoveSelectedItemsDialogButton = document.getElementById('closeMoveSelectedItemsDialogButton');
      const compareWithPreviousMonthButton = document.getElementById('compareWithPreviousMonthButton');
      const clearComparisonButton = document.getElementById('clearComparisonButton');
      const clearHistoryButton = document.getElementById('clearHistoryButton');
      const deleteSelectedHistoryItemsButton = document.getElementById('deleteSelectedHistoryItemsButton');
      const loadMonthHistoryButton = document.getElementById('loadMonthHistoryButton');
      const openDivideListButton = document.getElementById('openDivideListButton');
      const divideListSelect = document.getElementById('divideListSelect');
      const calculateDivisionButton = document.getElementById('calculateDivisionButton');
      const saveProfileEditsButton = document.getElementById('saveProfileEditsButton');
      const loadCurrentProfileButton = document.getElementById('loadCurrentProfileButton');
      const createNewListButton = document.getElementById('createNewListButton');
      const closeCreateListDialogButton = document.getElementById('closeCreateListDialogButton');
      const closeBudgetDialogButton = document.getElementById('closeBudgetDialogButton');
      const selectAllDeleteListsButton = document.getElementById('selectAllDeleteListsButton');
      const deleteSelectedListsButton = document.getElementById('deleteSelectedListsButton');
      const closeDeleteListDialogButton = document.getElementById('closeDeleteListDialogButton');
      const confirmDeleteAllListsButton = document.getElementById('confirmDeleteAllListsButton');
      const closeDeleteAllConfirmDialogButton = document.getElementById('closeDeleteAllConfirmDialogButton');
      const saveListNamesButton = document.getElementById('saveListNamesButton');
      const closeEditListDialogButton = document.getElementById('closeEditListDialogButton');
      const selectDivideListButton = document.getElementById('selectDivideListButton');
      const closeDivideListDialogButton = document.getElementById('closeDivideListDialogButton');
      const copyShareLinkButton = document.getElementById('copyShareLinkButton');
      const saveShareSettingsButton = document.getElementById('saveShareSettingsButton');
      const sendShareEmailButton = document.getElementById('sendShareEmailButton');
      const closeShareListDialogButton = document.getElementById('closeShareListDialogButton');
      const navigateToSelectedListButton = document.getElementById('navigateToSelectedListButton');
      const closeListNavigationDialogButton = document.getElementById('closeListNavigationDialogButton');
      const openPrivateListsButton = document.getElementById('openPrivateListsButton');
      const openRecentSharedListButton = document.getElementById('openRecentSharedListButton');
      const finishSharingButton = document.getElementById('finishSharingButton');
      const finishAndDivideButton = document.getElementById('finishAndDivideButton');
      const finishWithoutDivisionButton = document.getElementById('finishWithoutDivisionButton');
      const cancelFinishSharingButton = document.getElementById('cancelFinishSharingButton');
      const planUpgradeButton = document.getElementById('planUpgradeButton');
      const planCancelButton = document.getElementById('planCancelButton');
      const deleteAccountButton = document.getElementById('deleteAccountButton');
      const aiListForm = document.getElementById('aiListForm');
      const createAiListButton = document.getElementById('createAiListButton');
      const discardAiListButton = document.getElementById('discardAiListButton');

      if (setBalanceButton) {
        setBalanceButton.addEventListener('click', setBalance);
      }
      if (addItemButton) {
        addItemButton.addEventListener('click', addItem);
      }
      if (itemSectorSelect) {
        itemSectorSelect.addEventListener('change', () => {
          if (itemSectorSelect.value === CREATE_SECTOR_OPTION_VALUE) {
            const availableSectors = availableSectorNames();
            const previousSector = normalizeSectorName(itemSectorSelect.dataset.lastSector, 'Geral');
            itemSectorSelect.value = availableSectors.includes(previousSector)
              ? previousSector
              : (availableSectors.includes('Geral') ? 'Geral' : (availableSectors[0] || ''));
            openCreateSectorDialog();
            return;
          }
          itemSectorSelect.dataset.lastSector = itemSectorSelect.value;
        });
      }
      if (createSectorButton) {
        createSectorButton.addEventListener('click', createCustomSector);
      }
      if (closeCreateSectorDialogButton) {
        closeCreateSectorDialogButton.addEventListener('click', () => closeDialog('createSectorDialog'));
      }
      if (newSectorName) {
        newSectorName.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            createCustomSector();
          }
        });
      }
      if (triggerPhotoUpload) {
        triggerPhotoUpload.addEventListener('click', promptPhotoEdit);
      }
      if (profileAvatar) {
        profileAvatar.addEventListener('click', promptPhotoEdit);
      }
      if (shareButton) {
        shareButton.addEventListener('click', () => handleSidebarNavClick(showShareDialog));
      }
      if (homeButton) {
        homeButton.addEventListener('click', () => handleSidebarNavClick(() => showSection('homeSection')));
      }
      if (managementButton) {
        managementButton.addEventListener('click', () => handleSidebarNavClick(() => showSection('managementSection')));
      }
      if (shoppingButton) {
        shoppingButton.addEventListener('click', () => handleSidebarNavClick(() => showSection('shoppingSection')));
      }
      if (productsButton) {
        productsButton.addEventListener('click', () => handleSidebarNavClick(() => showSection('productsSection')));
      }
      if (manageListsButton) {
        manageListsButton.addEventListener('click', () => showSection('shoppingSection'));
      }
      if (openProductsFromListsButton) {
        openProductsFromListsButton.addEventListener('click', () => showSection('productsSection'));
      }
      if (historyButton) {
        historyButton.addEventListener('click', () => handleSidebarNavClick(() => showSection('historySection')));
      }
      if (divideButton) {
        divideButton.addEventListener('click', () => handleSidebarNavClick(() => showSection('divideSection')));
      }
      if (openListNavigationStat) {
        openListNavigationStat.addEventListener('click', openListNavigationDialog);
      }
      if (aiListForm) {
        aiListForm.addEventListener('submit', generateAiList);
      }
      if (createAiListButton) {
        createAiListButton.addEventListener('click', createListFromAiPreview);
      }
      if (discardAiListButton) {
        discardAiListButton.addEventListener('click', discardAiListPreview);
      }
      if (openBudgetDialogButton) {
        openBudgetDialogButton.addEventListener('click', openBudgetDialog);
      }
      if (openCreateListDialogButton) {
        openCreateListDialogButton.addEventListener('click', createNewListDialog);
      }
      if (openDeleteListDialogButton) {
        openDeleteListDialogButton.addEventListener('click', deleteListDialog);
      }
      if (openEditListNamesDialogButton) {
        openEditListNamesDialogButton.addEventListener('click', editListNamesDialog);
      }
      if (toggleSelectAllButton) {
        toggleSelectAllButton.addEventListener('click', toggleSelectAll);
      }
      if (moveSelectedListItemsButton) {
        moveSelectedListItemsButton.addEventListener('click', openMoveSelectedItemsDialog);
      }
      if (deleteSelectedListItemsButton) {
        deleteSelectedListItemsButton.addEventListener('click', deleteSelectedListItems);
      }
      if (confirmMoveSelectedItemsButton) {
        confirmMoveSelectedItemsButton.addEventListener('click', moveSelectedListItems);
      }
      if (closeMoveSelectedItemsDialogButton) {
        closeMoveSelectedItemsDialogButton.addEventListener('click', () => closeDialog('moveSelectedItemsDialog'));
      }
      if (compareWithPreviousMonthButton) {
        compareWithPreviousMonthButton.addEventListener('click', compareWithPreviousMonth);
      }
      if (clearComparisonButton) {
        clearComparisonButton.addEventListener('click', clearComparison);
      }
      if (clearHistoryButton) {
        clearHistoryButton.addEventListener('click', clearHistory);
      }
      if (deleteSelectedHistoryItemsButton) {
        deleteSelectedHistoryItemsButton.addEventListener('click', deleteSelectedHistoryItems);
      }
      if (loadMonthHistoryButton) {
        loadMonthHistoryButton.addEventListener('click', loadMonthHistory);
      }
      if (openDivideListButton) {
        openDivideListButton.addEventListener('click', openDivideListDialog);
      }
      if (divideListSelect) {
        divideListSelect.addEventListener('change', handleDivideListChange);
      }
      if (calculateDivisionButton) {
        calculateDivisionButton.addEventListener('click', calculateDivision);
      }
      if (saveProfileEditsButton) {
        saveProfileEditsButton.addEventListener('click', saveProfileEdits);
      }
      if (loadCurrentProfileButton) {
        loadCurrentProfileButton.addEventListener('click', loadCurrentProfile);
      }
      if (createNewListButton) {
        createNewListButton.addEventListener('click', createNewList);
      }
      if (closeCreateListDialogButton) {
        closeCreateListDialogButton.addEventListener('click', () => closeDialog('createListDialog'));
      }
      if (closeBudgetDialogButton) {
        closeBudgetDialogButton.addEventListener('click', () => closeDialog('budgetDialog'));
      }
      if (selectAllDeleteListsButton) {
        selectAllDeleteListsButton.addEventListener('click', selectAllDeleteLists);
      }
      if (deleteSelectedListsButton) {
        deleteSelectedListsButton.addEventListener('click', deleteSelectedLists);
      }
      if (closeDeleteListDialogButton) {
        closeDeleteListDialogButton.addEventListener('click', () => closeDialog('deleteListDialog'));
      }
      if (confirmDeleteAllListsButton) {
        confirmDeleteAllListsButton.addEventListener('click', confirmDeleteAllLists);
      }
      if (closeDeleteAllConfirmDialogButton) {
        closeDeleteAllConfirmDialogButton.addEventListener('click', () => closeDialog('deleteAllConfirmDialog'));
      }
      if (saveListNamesButton) {
        saveListNamesButton.addEventListener('click', saveListNames);
      }
      if (closeEditListDialogButton) {
        closeEditListDialogButton.addEventListener('click', () => closeDialog('editListDialog'));
      }
      if (selectDivideListButton) {
        selectDivideListButton.addEventListener('click', selectDivideList);
      }
      if (closeDivideListDialogButton) {
        closeDivideListDialogButton.addEventListener('click', () => closeDialog('divideListDialog'));
      }
      if (copyShareLinkButton) {
        copyShareLinkButton.addEventListener('click', copyShareLink);
      }
      if (saveShareSettingsButton) {
        saveShareSettingsButton.addEventListener('click', () => saveShareSettings(false));
      }
      if (sendShareEmailButton) {
        sendShareEmailButton.addEventListener('click', () => saveShareSettings(true));
      }
      if (closeShareListDialogButton) {
        closeShareListDialogButton.addEventListener('click', () => closeDialog('shareListDialog'));
      }
      if (navigateToSelectedListButton) {
        navigateToSelectedListButton.addEventListener('click', navigateToSelectedList);
      }
      if (closeListNavigationDialogButton) {
        closeListNavigationDialogButton.addEventListener('click', () => closeDialog('listNavigationDialog'));
      }
      if (openPrivateListsButton) {
        openPrivateListsButton.addEventListener('click', openPrivateLists);
      }
      if (openRecentSharedListButton) {
        openRecentSharedListButton.addEventListener('click', openRecentSharedList);
      }
      if (finishSharingButton) {
        finishSharingButton.addEventListener('click', showFinishSharingDialog);
      }
      if (finishAndDivideButton) {
        finishAndDivideButton.addEventListener('click', () => finalizeSharing(true));
      }
      if (finishWithoutDivisionButton) {
        finishWithoutDivisionButton.addEventListener('click', () => finalizeSharing(false));
      }
      if (cancelFinishSharingButton) {
        cancelFinishSharingButton.addEventListener('click', () => closeDialog('finishSharingDialog'));
      }
      if (planUpgradeButton) {
        planUpgradeButton.addEventListener('click', () => { window.location.href = '/planos'; });
      }
      if (planCancelButton) {
        planCancelButton.addEventListener('click', handleCancelSubscription);
      }
      if (deleteAccountButton) {
        deleteAccountButton.addEventListener('click', handleDeleteAccount);
      }
    }

    // Event listener para fechar menu ao clicar fora
    document.addEventListener('click', (e) => {
      const sidebar = document.getElementById('sidebar');
      const menuToggle = document.getElementById('menuToggle');
      if (isMenuOpen && !sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
        closeMenu();
      }
    });

    initializeLists();
    initializeCompactNav();
    initializeFirebaseSync();
    updatePlanUi();
    setupDialogOverlayClose();
    setupEventHandlers();
    initVoiceCommand();
    initAiChatPanel();
    initHomeQuickActions();
    setupListButtons();
    updateSharedModeUi();
    updateHistory();
    updateBalance();
    showSection('homeSection'); // Definir a seção inicial para visitante
