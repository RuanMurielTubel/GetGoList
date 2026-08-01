    let lists = {};
    let currentListName = "Lista 1";
    let selectedDivideListName = "";
    let selectedBalanceListName = "";
    let shoppingList = [];
    let listHistory = [];
    let editingIndex = null;
    let hasShownLowBalanceAlert = false;
    let allSelected = false;
    let isMenuOpen = false;
    let charts = {};
    let collapsedSectors = new Set();
    let firebaseAuth = null;
    let firestoreDb = null;
    let firebaseStorage = null;
    let currentFirebaseUser = null;
    let remoteListReference = null;
    let remoteListUnsubscribe = null;
    let sharedListId = null;
    let isSharedListMode = false;
    let remoteSyncReady = false;
    let applyingRemoteLists = false;
    let remoteSaveTimer = null;
    let initialRemoteSnapshotHandled = false;

    const firebaseConfig = {
      apiKey: "AIzaSyApgAliwYTpeIyYgEpeFTw6HrS5Bc-Kc9Q",
      authDomain: "getgolist.firebaseapp.com",
      projectId: "getgolist",
      storageBucket: "getgolist.appspot.com",
      appId: "getgolist"
    };

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

    function saveLists(options = {}) {
      try {
        localStorage.setItem('lists', JSON.stringify(lists));
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

      const listsPayload = JSON.parse(JSON.stringify(lists));
      const payload = {
        lists: listsPayload,
        currentListName,
        lastEditedBy: currentFirebaseUser ? (currentFirebaseUser.displayName || currentFirebaseUser.email || 'Usuário GetGoList') : 'Anônimo',
        lastEditedByEmail: currentFirebaseUser ? currentFirebaseUser.email || '' : '',
        lastEditedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      window.clearTimeout(remoteSaveTimer);
      remoteSaveTimer = window.setTimeout(() => {
        const saveOptions = sharedListId ? { merge: true } : {};
        remoteListReference.set(payload, saveOptions).catch(() => {
          updateAccountPanel("Conta conectada • sincronização pendente");
        });
      }, 350);
    }

    function updateAccountPanel(statusMessage) {
      const status = document.getElementById('syncStatus');
      const email = document.getElementById('accountEmail');
      const action = document.getElementById('accountAction');

      if (!email || !action) {
        return;
      }

      const navButtons = document.querySelectorAll('.sidebar > button');
      const sidebarGreeting = document.getElementById('sidebarGreeting');
      const sidebarAccount = document.querySelector('.sidebar-account');

      if (currentFirebaseUser) {
        status.textContent = statusMessage || "Conta conectada • sincronizado";
        email.textContent = currentFirebaseUser.email || "Conta GetGoList";
        action.textContent = "Sair da conta";
        navButtons.forEach((button) => {
          button.style.display = 'block';
        });
        if (sidebarGreeting) {
          sidebarGreeting.style.display = 'block';
        }
        if (sidebarAccount) {
          sidebarAccount.style.display = 'flex';
        }
      } else {
        status.textContent = "Modo visitante";
        email.textContent = "Listas salvas neste dispositivo";
        action.textContent = "Entrar e sincronizar";
        navButtons.forEach((button) => {
          button.style.display = 'none';
        });
        if (sidebarGreeting) {
          sidebarGreeting.style.display = 'none';
        }
        if (sidebarAccount) {
          sidebarAccount.style.display = 'none';
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
      const isDataPhoto = localProfileData.photoDataUrl && localProfileData.photoDataUrl.startsWith('data:image/');

      if (currentFirebaseUser) {
          const displayName = localProfileData.displayName || currentFirebaseUser.displayName || currentFirebaseUser.email || 'Usuário GetGoList';
        const photoURL = localProfileData.photoDataUrl || currentFirebaseUser.photoURL || '';
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

        if (photoURL) {
          avatar.innerHTML = `<img src="${photoURL}" alt="Avatar do perfil" />`;
          sidebarAvatar.innerHTML = `<img src="${photoURL}" alt="Avatar do perfil" />`;
        } else {
          const initialsText = displayName
            .split(' ')
            .filter(Boolean)
            .map((word) => word[0].toUpperCase())
            .slice(0, 2)
            .join('') || 'GV';
          avatar.innerHTML = `<span id="profileInitials">${initialsText}</span>`;
          sidebarAvatar.innerHTML = `<span>${initialsText}</span>`;
        }
      } else {
        const displayName = localProfileData.displayName || 'Visitante';
        const photoURL = localProfileData.photoDataUrl || '';

        nameElement.textContent = displayName;
        emailElement.textContent = 'Listas salvas neste dispositivo';
        statusElement.textContent = 'Entre para ativar o perfil';
        displayNameInput.value = localProfileData.displayName || '';
        profileBioInput.value = localProfileData.bio || '';
        sidebarName.textContent = displayName;

        if (photoURL) {
          avatar.innerHTML = `<img src="${photoURL}" alt="Avatar do perfil" />`;
          sidebarAvatar.innerHTML = `<img src="${photoURL}" alt="Avatar do perfil" />`;
        } else {
          const initialsText = displayName
            .split(' ')
            .filter(Boolean)
            .map((word) => word[0].toUpperCase())
            .slice(0, 2)
            .join('') || 'GV';
          avatar.innerHTML = `<span id="profileInitials">${initialsText}</span>`;
          sidebarAvatar.innerHTML = `<span>${initialsText}</span>`;
        }

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

      const displayName = displayNameInput.value.trim();
      const bio = profileBioInput.value.trim();

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
      const photoFileInput = document.getElementById('photoFileInput');
      if (photoFileInput) {
        photoFileInput.click();
      }
    }

    function triggerPhotoUpload() {
      promptPhotoEdit();
    }

    function handlePhotoFileSelect(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      if (!file.type.match('image/(jpeg|png)')) {
        alert('Por favor selecione um arquivo PNG ou JPEG.');
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

    function loadLocalProfileData() {
      try {
        const raw = localStorage.getItem('profileData');
        return raw ? JSON.parse(raw) : { displayName: '', photoDataUrl: '', bio: '' };
      } catch (error) {
        return { displayName: '', photoDataUrl: '', bio: '' };
      }
    }

    function saveLocalProfileData(data) {
      try {
        localStorage.setItem('profileData', JSON.stringify(data));
      } catch (error) {
        console.error('Erro ao salvar dados de perfil localmente:', error);
      }
    }

    function normalizeListData(listData) {
      if (!listData || typeof listData !== 'object') {
        return { items: [], history: [], balance: 0, initialBalance: 0 };
      }

      const normalizedItems = Array.isArray(listData.items)
        ? listData.items.map((item) => {
            const sanitizedItem = item && typeof item === 'object' ? item : {};
            return {
              name: String(sanitizedItem.name || ''),
              price: Number(sanitizedItem.price) || 0,
              quantity: Number(sanitizedItem.quantity) || 1,
              total: Number(sanitizedItem.total) || 0,
              sector: String(sanitizedItem.sector || 'Geral'),
              date: String(sanitizedItem.date || new Date().toLocaleDateString()),
              checked: Boolean(sanitizedItem.checked),
            };
          })
        : [];

      const normalizedHistory = Array.isArray(listData.history)
        ? listData.history.map((entry) => {
            const sanitizedEntry = entry && typeof entry === 'object' ? entry : {};
            return {
              name: String(sanitizedEntry.name || ''),
              price: Number(sanitizedEntry.price) || 0,
              quantity: Number(sanitizedEntry.quantity) || 1,
              total: Number(sanitizedEntry.total) || 0,
              sector: String(sanitizedEntry.sector || 'Geral'),
              date: String(sanitizedEntry.date || new Date().toLocaleDateString()),
              checked: Boolean(sanitizedEntry.checked),
            };
          })
        : [];

      return {
        items: normalizedItems,
        history: normalizedHistory,
        balance: typeof listData.balance === 'number' ? listData.balance : Number(listData.balance) || 0,
        initialBalance: typeof listData.initialBalance === 'number' ? listData.initialBalance : Number(listData.initialBalance) || 0,
      };
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
        localStorage.removeItem('lists');
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
      lists = remoteLists;
      currentListName =
        preferredListName && lists[preferredListName]
          ? preferredListName
          : Object.keys(lists)[0];
      shoppingList = lists[currentListName].items || [];
      listHistory = lists[currentListName].history || [];
      selectedBalanceListName = currentListName;
      clearLocalCache();
      saveLists({ localOnly: true });

      setupListButtons();
      updateList();
      updateHistory();
      updateFooter();
      updateDashboard();
      updateTargetListSelect();
      updateMonthSelect();
      applyingRemoteLists = false;
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
        firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {
          // O app continua funcionando com cache em memória.
        });

        firebaseAuth.onAuthStateChanged((user) => {
          currentFirebaseUser = user;
          remoteSyncReady = false;
          initialRemoteSnapshotHandled = false;

          if (remoteListUnsubscribe) {
            remoteListUnsubscribe();
            remoteListUnsubscribe = null;
          }

          if (!user) {
            remoteListReference = null;
            if (sharedListId) {
              updateAccountPanel('Entre para participar da lista compartilhada');
              const redirectUrl = `${window.location.pathname}${window.location.search}`;
              window.location.replace(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
              return;
            }

            updateAccountPanel();
            if (window.location.pathname.endsWith('/index.html')) {
              window.location.replace('/login');
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
          showSection('shoppingSection');

          remoteListUnsubscribe = remoteListReference.onSnapshot((snapshot) => {
            const remoteData = snapshot.exists ? snapshot.data() : null;

            if (remoteData && remoteData.lists && Object.keys(remoteData.lists).length) {
              if (!initialRemoteSnapshotHandled) {
                const mergedLists = mergeLocalAndRemoteLists(remoteData.lists, lists);
                applyRemoteLists(mergedLists, remoteData.currentListName);
                initialRemoteSnapshotHandled = true;
                remoteSyncReady = true;
                saveLists();
              } else {
                applyRemoteLists(remoteData.lists, remoteData.currentListName);
                remoteSyncReady = true;
              }
            } else {
              initialRemoteSnapshotHandled = true;
              remoteSyncReady = true;
              saveLists();
            }

            const lastEditorName = remoteData && (remoteData.lastEditedBy || remoteData.lastEditedByEmail);
            updateLastEditedInfo(lastEditorName);
            updateAccountPanel();
          }, () => {
            remoteSyncReady = false;
            updateAccountPanel("Conta conectada • sincronização pendente");
          });
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
      const defaultLists = {
        "Lista 1": { items: [], history: [], balance: 0, initialBalance: 0 }
      };

      // Tenta carregar listas do localStorage, mas ignore em modo de lista compartilhada.
      let storedLists = null;
      if (!sharedListId) {
        try {
          const storedData = localStorage.getItem('lists');
          if (storedData) {
            storedLists = JSON.parse(storedData);
            console.log("Dados carregados do localStorage:", storedLists);
          }
        } catch (e) {
          console.error("Erro ao parsear localStorage 'lists':", e);
        }
      }

      // Verifica se há uma lista importada na URL
      const urlParams = new URLSearchParams(window.location.search);
      const importList = urlParams.get('importList');
      sharedListId = urlParams.get('sharedList');
      if (sharedListId) {
        isSharedListMode = true;
      }
      let importedListName = null;
      if (importList) {
        try {
          const decodedData = JSON.parse(atob(importList));
          if (decodedData && decodedData.name && decodedData.data) {
            lists[decodedData.name] = {
              items: decodedData.data.items || [],
              history: decodedData.data.history || [],
              balance: decodedData.data.balance || 0,
              initialBalance: decodedData.data.initialBalance || 0
            };
            importedListName = decodedData.name;
            console.log(`Lista importada: ${decodedData.name}`);
          } else {
            console.error("Dados de importação inválidos");
          }
        } catch (e) {
          console.error("Erro ao decodificar dados de importação:", e);
        }
      }

      // Inicializa listas com base no localStorage ou importação
      if (!storedLists || typeof storedLists !== 'object' || Object.keys(storedLists).length === 0) {
        console.warn("localStorage vazio, corrompido ou inválido. Usando listas padrão ou importada.");
        lists = importedListName ? lists : defaultLists;
      } else {
        lists = {};
        Object.keys(storedLists).forEach(listName => {
          const storedList = storedLists[listName];
          lists[listName] = {
            items: Array.isArray(storedList?.items)
              ? storedList.items.map((item) => ({
                  ...item,
                  sector: item?.sector || 'Geral',
                  checked: Boolean(item && typeof item === 'object' ? item.checked : false)
                }))
              : [],
            history: Array.isArray(storedList?.history) ? storedList.history : [],
            balance: typeof storedList?.balance === 'number' ? storedList.balance : 0,
            initialBalance: typeof storedList?.initialBalance === 'number' ? storedList.initialBalance : 0
          };
        });
        if (importedListName) {
          lists[importedListName] = lists[importedListName] || defaultLists["Lista 1"];
        }
      }

      // Define a lista atual
      currentListName = importedListName || Object.keys(lists)[0] || "Lista 1";
      if (!lists[currentListName]) {
        console.warn(`Lista "${currentListName}" não encontrada. Criando lista padrão.`);
        lists[currentListName] = { items: [], history: [], balance: 0, initialBalance: 0 };
      }

      shoppingList = lists[currentListName].items;
      listHistory = lists[currentListName].history;
      selectedBalanceListName = currentListName;

      // Salva listas no localStorage
      try {
        saveLists();
        console.log("Estrutura inicial salva no localStorage:", lists);
      } catch (e) {
        console.error("Erro ao salvar listas no localStorage:", e);
      }

      updateFooter();
      updateDashboard();
      updateTargetListSelect();
      populateSectorSelect();

      // Limpa parâmetro de importação da URL
      if (importList) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    function updateDashboard() {
      updateStats();
      updateCharts();
    }

    function populateSectorSelect() {
      const select = document.getElementById('itemSector');
      if (!select) return;
      select.innerHTML = '';
      predefinedSectors.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
      });
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

      document.getElementById('totalLists').textContent = totalLists;
      document.getElementById('totalItems').textContent = totalItems;
      document.getElementById('totalSpent').textContent = `R$ ${totalSpent.toFixed(2).replace('.', ',')}`;
      document.getElementById('avgMonthly').textContent = `R$ ${avgMonthly.toFixed(2).replace('.', ',')}`;
    }

    function updateCharts() {
      updateMonthlyChart();
      updateItemsChart();
      updateExpenseChart();
      updateTrendChart();
    }

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
            borderColor: '#007bff',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
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
            backgroundColor: [
              '#007bff',
              '#28a745',
              '#ffc107',
              '#dc3545',
              '#6c757d'
            ]
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
            backgroundColor: '#28a745'
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
            borderColor: '#ffc107',
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
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
    }

    function updateFooter() {
      const footerListName = document.getElementById('footerListName');
      const footerItemCount = document.getElementById('footerItemCount');
      const footerBalance = document.getElementById('footerBalance');
      
      if (footerListName && footerItemCount && footerBalance) {
        const balance = lists[currentListName].balance;
        const itemCount = lists[currentListName].items.length;
        
        footerListName.textContent = currentListName;
        footerItemCount.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`;
        footerBalance.textContent = `R$ ${balance.toFixed(2).replace('.', ',')}`;
        
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
      const targetButton = document.querySelector(`.sidebar button[onclick="showSection('${sectionId}')"]`);
      if (targetButton) {
        targetButton.classList.add('active');
      }
      const sectionTitles = {
        homeSection: 'Início',
        balanceSection: 'Saldo',
        shoppingSection: 'Lista de Compras',
        historySection: 'Histórico',
        divideSection: 'Divisão',
        profileSection: 'Meu Perfil'
      };
      document.getElementById('mainTitle').textContent = sectionTitles[sectionId] || 'Lista de Compras';
      
      // Fecha o menu após selecionar uma opção
      closeMenu();
      
      if (!currentFirebaseUser && sectionId !== 'homeSection') {
        alert('Faça login para acessar esta área.');
        showSection('homeSection');
        return;
      }

      if (sectionId === 'homeSection') {
        updateDashboard();
      }
      if (sectionId === 'historySection') {
        updateHistory();
        updateTargetListSelect();
      }
      if (sectionId === 'profileSection') {
        updateProfileSection();
      }
      if (sectionId === 'divideSection') {
        document.getElementById('divisionResult').innerHTML = '';
        document.getElementById('selectedDivideList').textContent = selectedDivideListName || 'Nenhuma lista selecionada';
      }
      if (sectionId === 'balanceSection') {
        document.getElementById('selectedBalanceList').textContent = selectedBalanceListName || 'Nenhuma lista selecionada';
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
      return parseFloat(value.replace(',', '.')) || 0;
    }

    function openBalanceListDialog() {
      console.log("Tentando abrir diálogo de seleção de lista para saldo");
      const dialog = document.getElementById('selectListDialog');
      if (!dialog) {
        console.error("Elemento de diálogo 'selectListDialog' não encontrado");
        return;
      }
      const options = document.getElementById('selectListOptions');
      if (!options) {
        console.error("Elemento de opções de seleção de lista não encontrado");
        return;
      }
      options.innerHTML = '';
      Object.keys(lists).forEach(listName => {
        const li = document.createElement('li');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `select-${listName}`;
        checkbox.name = 'selectList';
        checkbox.value = listName;
        if (listName === selectedBalanceListName) {
          checkbox.checked = true;
        }
        const label = document.createElement('label');
        label.htmlFor = `select-${listName}`;
        label.textContent = listName;
        li.appendChild(checkbox);
        li.appendChild(label);
        options.appendChild(li);
      });
      dialog.style.display = 'flex';
      console.log("Diálogo de seleção de lista para saldo aberto com sucesso");
    }

    function setBalance() {
      const balanceInput = document.getElementById('balanceInput');
      if (!balanceInput) {
        console.error("Elemento de entrada de saldo não encontrado");
        return;
      }
      if (!selectedBalanceListName) {
        alert('Por favor, selecione uma lista para definir o saldo.');
        return;
      }
      if (!lists[selectedBalanceListName]) {
        console.error(`Lista selecionada ${selectedBalanceListName} não existe`);
        alert('Erro: A lista selecionada não existe.');
        return;
      }
      const balanceValue = parsePrice(balanceInput.value);
      if (balanceValue >= 0) {
        const totalSpent = lists[selectedBalanceListName].items.reduce((sum, item) => sum + item.total, 0);
        lists[selectedBalanceListName].initialBalance = balanceValue;
        lists[selectedBalanceListName].balance = balanceValue - totalSpent;
        hasShownLowBalanceAlert = false;
        try {
          saveLists();
          console.log("Saldo inicial atualizado e saldo restante recalculado para:", selectedBalanceListName, lists[selectedBalanceListName]);
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        if (selectedBalanceListName === currentListName) {
          updateBalance();
          updateTotal();
          updateFooter();
        }
        balanceInput.value = '';
      } else {
        alert('Por favor, insira um saldo válido.');
      }
    }

    function addItem() {
      const itemName = document.getElementById('itemName').value.trim();
      const itemPrice = parsePrice(document.getElementById('itemPrice').value);
      const itemQuantity = parseInt(document.getElementById('itemQuantity').value) || 1;
      const itemSector = document.getElementById('itemSector').value.trim() || 'Geral';
      const itemTotal = itemPrice * itemQuantity;

      if (itemName && itemPrice > 0 && itemQuantity > 0) {
        const currentBalance = lists[currentListName].balance;
        if (currentBalance >= 0 && itemTotal > currentBalance) {
          if (!confirm(`O valor ultrapassa o saldo. Confirma inclusão do produto? (Total: R$ ${itemTotal.toFixed(2).replace('.', ',')} | Saldo: R$ ${currentBalance.toFixed(2).replace('.', ',')})`)) {
            return;
          }
        }
        const item = {
          name: itemName,
          price: itemPrice,
          quantity: itemQuantity,
          total: itemTotal,
          sector: itemSector,
          date: new Date().toLocaleDateString(),
          checked: false
        };
        shoppingList.push(item);
        listHistory.push(item);
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
        document.getElementById('itemName').value = '';
        document.getElementById('itemPrice').value = '';
        document.getElementById('itemQuantity').value = '1';
        document.getElementById('itemSector').value = '';
      } else {
        alert('Por favor, insira um nome, preço e quantidade válidos.');
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
      const itemName = li.querySelector('.edit-name').value.trim();
      const itemPrice = parsePrice(li.querySelector('.edit-price').value);
      const itemQuantity = parseInt(li.querySelector('.edit-quantity').value) || 1;
      const sectorEl = li.querySelector('.edit-sector');
      const itemSector = sectorEl ? (sectorEl.value || 'Geral') : 'Geral';
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
          name: itemName,
          price: itemPrice,
          quantity: itemQuantity,
          total: itemTotal,
          sector: itemSector,
          date: new Date().toLocaleDateString(),
          checked: oldItem.checked
        };
        shoppingList[index] = newItem;
        listHistory.push(newItem);
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

    function cancelEdit(index) {
      editingIndex = null;
      updateList();
    }

    function removeItem(index) {
      const item = shoppingList[index];
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
      shoppingList.forEach((item, index) => {
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

    function clearHistory() {
      if (confirm('Tem certeza que deseja limpar o histórico desta lista? Esta ação não pode ser desfeita.')) {
        console.log("Limpando histórico da lista:", currentListName);
        listHistory = [];
        shoppingList = [];
        lists[currentListName].history = listHistory;
        lists[currentListName].items = shoppingList;
        lists[currentListName].balance = lists[currentListName].initialBalance;
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

    function updateList() {
      const list = document.getElementById('shoppingList');
      if (!list) {
        console.error("Elemento de lista de compras não encontrado");
        return;
      }

      list.innerHTML = '';

      const groupedItems = shoppingList.reduce((groups, item, index) => {
        const sectorName = item?.sector && item.sector.trim() ? item.sector.trim() : 'Geral';
        if (!groups[sectorName]) {
          groups[sectorName] = [];
        }
        groups[sectorName].push({ item, index });
        return groups;
      }, {});

      const sectorNames = Object.keys(groupedItems).sort((first, second) => {
        if (first === 'Geral') return -1;
        if (second === 'Geral') return 1;
        return first.localeCompare(second, 'pt-BR');
      });

      sectorNames.forEach((sectorName) => {
        const sectorItems = groupedItems[sectorName];
        const section = document.createElement('section');
        section.className = 'sector-group';

        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'sector-header';
        header.innerHTML = `<span>${sectorName}</span><span>${sectorItems.length} item${sectorItems.length === 1 ? '' : 's'}</span>`;
        header.addEventListener('click', () => {
          if (collapsedSectors.has(sectorName)) {
            collapsedSectors.delete(sectorName);
          } else {
            collapsedSectors.add(sectorName);
          }
          updateList();
        });

        const body = document.createElement('div');
        body.className = 'sector-body';
        if (collapsedSectors.has(sectorName)) {
          body.classList.add('collapsed');
        }

        const ul = document.createElement('ul');
        ul.className = 'sector-items';

        sectorItems.forEach(({ item, index }) => {
          const li = document.createElement('li');
          li.id = `item-${index}`;
          if (editingIndex === index) {
            li.classList.add('editing');
            li.innerHTML = `
              <input type="text" class="edit-name" value="${item.name}">
              <input type="text" class="edit-price" value="${item.price.toFixed(2).replace('.', ',')}" oninput="formatPrice(this)">
              <input type="number" class="edit-quantity" value="${item.quantity}" min="1">
              <select class="edit-sector">
                ${predefinedSectors.map(s => `<option value=\"${s}\" ${ (item?.sector && item.sector.trim() ? item.sector : 'Geral') === s ? 'selected' : '' }> ${s} </option>`).join('')}
              </select>
              <button onclick="saveEdit(${index})">Salvar</button>
              <button onclick="cancelEdit(${index})">Cancelar</button>
            `;
          } else {
            li.innerHTML = `
              <div class="item-info">
                <span class="${item.checked ? 'checked' : ''}">${item.name} - ${item.quantity} x R$ ${item.price.toFixed(2).replace('.', ',')} = R$ ${item.total.toFixed(2).replace('.', ',')}</span>
                <small class="item-sector-label">Setor: ${item?.sector && item.sector.trim() ? item.sector : 'Geral'}</small>
              </div>
              <div class="item-controls">
                <div class="checkbox-container">
                  <input type="checkbox" name="listItem" id="list-item-${index}" value="${index}" ${item.checked ? 'checked' : ''}>
                </div>
                <div class="action-buttons">
                  <button class="edit" onclick="editItem(${index})">Editar</button>
                  <button onclick="removeItem(${index})">Remover</button>
                </div>
              </div>
            `;
            const checkbox = li.querySelector(`#list-item-${index}`);
            if (checkbox) {
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
          }
          ul.appendChild(li);
        });

        body.appendChild(ul);
        section.appendChild(header);
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
        alert('Atenção: você já ultrapassou o saldo estabelecido!');
        hasShownLowBalanceAlert = true;
      } else if (initialBalance > 0 && balance <= initialBalance * 0.1 && balance >= 0 && !hasShownLowBalanceAlert) {
        alertElement.textContent = 'Atenção: Seu saldo está baixo. Restam menos de 10% do valor inicial.';
        alertElement.classList.add('active');
        alert('Atenção: seu saldo está baixo. Restam menos de 10% do valor inicial.');
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
        li.innerHTML = `
          <label for="history-${index}">${item.date}: ${item.name} - ${item.quantity} x R$ ${item.price.toFixed(2).replace('.', ',')} = R$ ${item.total.toFixed(2).replace('.', ',')}</label>
          <input type="checkbox" name="historyItem" id="history-${index}" value="${index}">
        `;
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
          li.innerHTML = `
            ${name}: 
            Mês Atual - ${current.quantity} x R$ ${current.price.toFixed(2).replace('.', ',')} = R$ ${current.total.toFixed(2).replace('.', ',')} | 
            Mês Anterior - ${previous.quantity} x R$ ${previous.price.toFixed(2).replace('.', ',')} = R$ ${previous.total.toFixed(2).replace('.', ',')} | 
            Diferença - R$ ${(current.total - previous.total).toFixed(2).replace('.', ',')}
          `;
          comparisonList.appendChild(li);
        }
      });

      if (comparisonList.children.length > 0) {
        comparisonResult.appendChild(comparisonList);
      } else {
        comparisonResult.innerHTML += '<p>Nenhum item comum encontrado para comparação.</p>';
      }
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
      closeDialog('divideListDialog');
      console.log("Lista selecionada para divisão:", selectedListName);
    }

    function calculateDivision() {
      const input = document.getElementById('dividePeople');
      const resultDiv = document.getElementById('divisionResult');
      if (!input || !resultDiv) {
        console.error("Elemento de entrada ou resultado de divisão não encontrado");
        return;
      }
      const numPeople = parseInt(input.value) || 0;
      if (!selectedDivideListName) {
        resultDiv.innerHTML = '<p style="color: red;">Por favor, selecione uma lista.</p>';
        return;
      }
      if (numPeople <= 0) {
        resultDiv.innerHTML = '<p style="color: red;">Por favor, insira um número válido de pessoas (maior que 0).</p>';
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
      resultDiv.innerHTML = `
        <p>Lista: ${selectedDivideListName}</p>
        <p>Total: R$ ${total.toFixed(2).replace('.', ',')}</p>
        <p>Dividido por ${numPeople} pessoas: R$ ${perPerson.toFixed(2).replace('.', ',')} por pessoa</p>
      `;
      console.log(`Divisão calculada: Total R$ ${total.toFixed(2)} / ${numPeople} = R$ ${perPerson.toFixed(2)} por pessoa`);
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

    function showShareDialog() {
      console.log("Tentando abrir diálogo de compartilhamento");
      const dialog = document.getElementById('shareListDialog');
      const shareListName = document.getElementById('shareListName');
      const shareEmailInput = document.getElementById('shareEmailInput');
      const shareLinkToggle = document.getElementById('shareLinkToggle');
      const shareLink = document.getElementById('shareLink');
      if (!dialog || !shareListName || !shareEmailInput || !shareLinkToggle || !shareLink) {
        console.error("Elementos de diálogo de compartilhamento não encontrados");
        return;
      }
      if (!currentFirebaseUser || !firebaseAuth) {
        alert('Faça login para compartilhar esta lista e permitir que outras pessoas colaborem.');
        return;
      }
      if (!firestoreDb) {
        alert('Firebase não está inicializado. Tente recarregar a página.');
        return;
      }

      shareListName.textContent = currentListName;
      shareLinkToggle.checked = true;
      shareEmailInput.value = '';
      const shareErrorMessage = document.getElementById('shareErrorMessage');
      if (shareErrorMessage) {
        shareErrorMessage.style.display = 'none';
        shareErrorMessage.textContent = '';
      }

      const initializeDialogFields = (docData = {}) => {
        if (Array.isArray(docData.allowedEmails)) {
          const currentUserEmail = (currentFirebaseUser.email || '').toLowerCase();
          const otherEmails = docData.allowedEmails
            .map((email) => (typeof email === 'string' ? email.trim().toLowerCase() : ''))
            .filter((email) => email && email !== currentUserEmail);
          shareEmailInput.value = otherEmails.join(', ');
        }
        shareLinkToggle.checked = docData.linkAccess !== false;
      };

      const buildAllowedEmails = () => {
        const currentUserEmail = (currentFirebaseUser.email || '').toLowerCase();
        const allowedEmails = currentUserEmail ? [currentUserEmail] : [];
        const extraEmails = parseSharedEmails(shareEmailInput.value);
        extraEmails.forEach((email) => {
          if (!allowedEmails.includes(email)) {
            allowedEmails.push(email);
          }
        });
        return allowedEmails;
      };

      const createOrUpdateShareDoc = (docRef, merge = false) => {
        const allowedEmails = buildAllowedEmails();
        const listData = {
          lists,
          currentListName,
          owner: currentFirebaseUser.uid,
          ownerEmail: currentFirebaseUser.email || '',
          allowedEmails,
          linkAccess: shareLinkToggle.checked,
          lastEditedBy: currentFirebaseUser ? (currentFirebaseUser.displayName || currentFirebaseUser.email || 'Usuário GetGoList') : 'Anônimo',
          lastEditedByEmail: currentFirebaseUser ? currentFirebaseUser.email || '' : '',
          lastEditedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const payload = merge
          ? { ...listData }
          : { ...listData, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

        const setPromise = merge
          ? docRef.set(payload, { merge: true })
          : docRef.set(payload);

        setPromise
          .then(() => {
            remoteListReference = docRef;
            const sharedUrl = `${window.location.origin}${window.location.pathname}?sharedList=${docRef.id}`;
            shareLink.value = sharedUrl;
            sharedListId = docRef.id;
            isSharedListMode = true;
            dialog.style.display = 'flex';
            console.log('Diálogo de compartilhamento aberto com sucesso', sharedUrl);
          })
          .catch((error) => {
            console.error('Erro ao salvar lista compartilhada:', error);
            const errorMessage = error && (error.message || error.code || error.toString()) ?
              (error.message || error.code || error.toString()) : 'desconhecido';
            const errorDetails = error && typeof error === 'object'
              ? JSON.stringify(error, Object.getOwnPropertyNames(error))
              : String(error);
            const message = `Não foi possível criar o compartilhamento da lista.\nErro: ${errorMessage}\nDetalhes: ${errorDetails}`;
            const shareErrorMessage = document.getElementById('shareErrorMessage');
            if (shareErrorMessage) {
              shareErrorMessage.style.display = 'block';
              shareErrorMessage.textContent = message;
            } else {
              alert(message);
            }
          });
      };

      if (sharedListId) {
        const docRef = firestoreDb.collection('sharedLists').doc(sharedListId);
        docRef.get()
          .then((snapshot) => {
            if (snapshot.exists) {
              initializeDialogFields(snapshot.data());
            }
            createOrUpdateShareDoc(docRef, true);
          })
          .catch((error) => {
            console.error('Erro ao buscar dados da lista compartilhada:', error);
            createOrUpdateShareDoc(docRef, true);
          });
      } else {
        const docRef = firestoreDb.collection('sharedLists').doc();
        initializeDialogFields({ linkAccess: true });
        createOrUpdateShareDoc(docRef, false);
      }
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
      selectedBalanceListName = selectedListName;
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
      const selectedBalanceListSpan = document.getElementById('selectedBalanceList');
      if (selectedBalanceListSpan) {
        selectedBalanceListSpan.textContent = selectedBalanceListName;
      }
      closeDialog('listNavigationDialog');
      showSection('shoppingSection');
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

    function setupListButtons() {
      const listButtons = document.getElementById('listButtons');
      if (!listButtons) {
        console.error("Contêiner de botões de lista não encontrado");
        return;
      }
      listButtons.innerHTML = '';
      Object.keys(lists).forEach(listName => {
        console.log("Criando botão para:", listName);
        const button = document.createElement('button');
        button.className = `list ${listName === currentListName ? 'active' : ''}`;
        button.textContent = listName;
        button.onclick = () => {
          if (!lists[listName]) {
            console.error(`Lista ${listName} não existe ao trocar`);
            return;
          }
          console.log("Trocando para lista:", listName);
          currentListName = listName;
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
          showSection('shoppingSection');
        };
        listButtons.appendChild(button);
      });
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
      if (input) {
        input.value = '';
        console.log("Diálogo de criação de lista aberto com sucesso");
      } else {
        console.error("Elemento de entrada 'newListName' não encontrado");
      }
    }

    function createNewList() {
      const input = document.getElementById('newListName');
      if (!input) {
        console.error("Elemento de entrada 'newListName' não encontrado");
        return;
      }
      const newName = input.value.trim();
      if (newName && !lists[newName]) {
        lists[newName] = { items: [], history: [], balance: 0, initialBalance: 0 };
        try {
          saveLists();
        } catch (e) {
          console.error("Erro ao salvar listas no localStorage:", e);
        }
        closeDialog('createListDialog');
        setupListButtons();
        updateDashboard();
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
      let currentWasDeleted = false;
      let divideListWasDeleted = false;
      let balanceListWasDeleted = false;
      checkboxes.forEach(checkbox => {
        const listName = checkbox.value;
        console.log("Excluindo lista:", listName);
        if (listName === currentListName) currentWasDeleted = true;
        if (listName === selectedDivideListName) divideListWasDeleted = true;
        if (listName === selectedBalanceListName) balanceListWasDeleted = true;
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
      if (balanceListWasDeleted) {
        selectedBalanceListName = currentListName;
        const selectedListSpan = document.getElementById('selectedBalanceList');
        if (selectedListSpan) {
          selectedListSpan.textContent = currentListName;
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
      let balanceListWasDeleted = false;
      checkboxes.forEach(checkbox => {
        const listName = checkbox.value;
        console.log("Excluindo lista:", listName);
        if (listName === currentListName) currentWasDeleted = true;
        if (listName === selectedDivideListName) divideListWasDeleted = true;
        if (listName === selectedBalanceListName) balanceListWasDeleted = true;
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
      if (balanceListWasDeleted) {
        selectedBalanceListName = currentListName;
        const selectedListSpan = document.getElementById('selectedBalanceList');
        if (selectedListSpan) {
          selectedListSpan.textContent = currentListName;
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
        const newName = window.nameInputs[oldName].value.trim();
        if (newName && !newNames[newName] && newName !== oldName) {
          newNames[newName] = lists[oldName];
          if (currentListName === oldName) currentListName = newName;
          if (selectedDivideListName === oldName) selectedDivideListName = newName;
          if (selectedBalanceListName === oldName) selectedBalanceListName = newName;
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
        const selectedBalanceListSpan = document.getElementById('selectedBalanceList');
        if (selectedBalanceListSpan) {
          selectedBalanceListSpan.textContent = selectedBalanceListName || 'Nenhuma lista selecionada';
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

    function selectListDialog() {
      console.log("Tentando abrir diálogo de seleção de lista");
      const dialog = document.getElementById('selectListDialog');
      if (!dialog) {
        console.error("Elemento de diálogo 'selectListDialog' não encontrado");
        return;
      }
      const options = document.getElementById('selectListOptions');
      if (!options) {
        console.error("Elemento de opções de seleção de lista não encontrado");
        return;
      }
      options.innerHTML = '';
      Object.keys(lists).forEach(listName => {
        const li = document.createElement('li');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `select-${listName}`;
        checkbox.name = 'selectList';
        checkbox.value = listName;
        const label = document.createElement('label');
        label.htmlFor = `select-${listName}`;
        label.textContent = listName;
        li.appendChild(checkbox);
        li.appendChild(label);
        options.appendChild(li);
      });
      dialog.style.display = 'flex';
      console.log("Diálogo de seleção de lista aberto com sucesso");
    }

    function selectChosenLists() {
      const checkboxes = document.querySelectorAll('input[name="selectList"]:checked');
      if (checkboxes.length === 0) {
        alert('Selecione pelo menos uma lista para escolher!');
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
      currentListName = selectedListName;
      selectedBalanceListName = selectedListName;
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
      const selectedBalanceListSpan = document.getElementById('selectedBalanceList');
      if (selectedBalanceListSpan) {
        selectedBalanceListSpan.textContent = selectedBalanceListName;
      }
      closeDialog('selectListDialog');
      showSection('shoppingSection');
      console.log("Lista selecionada:", currentListName);
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
      const overlay = document.getElementById('overlay');
      const accountAction = document.getElementById('accountAction');
      const photoFileInput = document.getElementById('photoFileInput');
      const itemPrice = document.getElementById('itemPrice');
      const balanceInput = document.getElementById('balanceInput');

      if (menuToggle) {
        menuToggle.addEventListener('click', toggleMenu);
      }
      if (overlay) {
        overlay.addEventListener('click', closeMenu);
      }
      if (accountAction) {
        accountAction.addEventListener('click', handleAccountAction);
      }
      if (photoFileInput) {
        photoFileInput.addEventListener('change', handlePhotoFileSelect);
      }
      if (itemPrice) {
        itemPrice.addEventListener('input', function () {
          formatPrice(this);
        });
      }
      if (balanceInput) {
        balanceInput.addEventListener('input', function () {
          formatPrice(this);
        });
      }
      const setBalanceButton = document.getElementById('setBalanceButton');
      const addItemButton = document.getElementById('addItemButton');
      const triggerPhotoUpload = document.getElementById('triggerPhotoUpload');
      const profileAvatar = document.getElementById('profileAvatar');
      const shareButton = document.querySelector('.share-button');
      const homeButton = document.querySelector('.home-button');
      const balanceButton = document.querySelector('.balance-button');
      const shoppingButton = document.querySelector('.shopping-button');
      const historyButton = document.querySelector('.history-button');
      const divideButton = document.querySelector('.divide-button');
      const profileButton = document.querySelector('.profile-button');
      const openListNavigationStat = document.getElementById('openListNavigationStat');
      const openBalanceListButton = document.getElementById('openBalanceListButton');
      const openCreateListDialogButton = document.getElementById('openCreateListDialogButton');
      const openDeleteListDialogButton = document.getElementById('openDeleteListDialogButton');
      const openEditListNamesDialogButton = document.getElementById('openEditListNamesDialogButton');
      const openSelectListDialogButton = document.getElementById('openSelectListDialogButton');
      const toggleSelectAllButton = document.getElementById('toggleSelectAllButton');
      const deleteSelectedListItemsButton = document.getElementById('deleteSelectedListItemsButton');
      const compareWithPreviousMonthButton = document.getElementById('compareWithPreviousMonthButton');
      const clearComparisonButton = document.getElementById('clearComparisonButton');
      const clearHistoryButton = document.getElementById('clearHistoryButton');
      const deleteSelectedHistoryItemsButton = document.getElementById('deleteSelectedHistoryItemsButton');
      const loadMonthHistoryButton = document.getElementById('loadMonthHistoryButton');
      const openDivideListButton = document.getElementById('openDivideListButton');
      const calculateDivisionButton = document.getElementById('calculateDivisionButton');
      const saveProfileEditsButton = document.getElementById('saveProfileEditsButton');
      const loadCurrentProfileButton = document.getElementById('loadCurrentProfileButton');
      const createNewListButton = document.getElementById('createNewListButton');
      const closeCreateListDialogButton = document.getElementById('closeCreateListDialogButton');
      const selectAllDeleteListsButton = document.getElementById('selectAllDeleteListsButton');
      const deleteSelectedListsButton = document.getElementById('deleteSelectedListsButton');
      const closeDeleteListDialogButton = document.getElementById('closeDeleteListDialogButton');
      const confirmDeleteAllListsButton = document.getElementById('confirmDeleteAllListsButton');
      const closeDeleteAllConfirmDialogButton = document.getElementById('closeDeleteAllConfirmDialogButton');
      const saveListNamesButton = document.getElementById('saveListNamesButton');
      const closeEditListDialogButton = document.getElementById('closeEditListDialogButton');
      const selectChosenListsButton = document.getElementById('selectChosenListsButton');
      const closeSelectListDialogButton = document.getElementById('closeSelectListDialogButton');
      const selectDivideListButton = document.getElementById('selectDivideListButton');
      const closeDivideListDialogButton = document.getElementById('closeDivideListDialogButton');
      const copyShareLinkButton = document.getElementById('copyShareLinkButton');
      const closeShareListDialogButton = document.getElementById('closeShareListDialogButton');
      const navigateToSelectedListButton = document.getElementById('navigateToSelectedListButton');
      const closeListNavigationDialogButton = document.getElementById('closeListNavigationDialogButton');

      if (setBalanceButton) {
        setBalanceButton.addEventListener('click', setBalance);
      }
      if (addItemButton) {
        addItemButton.addEventListener('click', addItem);
      }
      if (triggerPhotoUpload) {
        triggerPhotoUpload.addEventListener('click', promptPhotoEdit);
      }
      if (profileAvatar) {
        profileAvatar.addEventListener('click', promptPhotoEdit);
      }
      if (shareButton) {
        shareButton.addEventListener('click', showShareDialog);
      }
      if (homeButton) {
        homeButton.addEventListener('click', () => showSection('homeSection'));
      }
      if (balanceButton) {
        balanceButton.addEventListener('click', () => showSection('balanceSection'));
      }
      if (shoppingButton) {
        shoppingButton.addEventListener('click', () => showSection('shoppingSection'));
      }
      if (historyButton) {
        historyButton.addEventListener('click', () => showSection('historySection'));
      }
      if (divideButton) {
        divideButton.addEventListener('click', () => showSection('divideSection'));
      }
      if (profileButton) {
        profileButton.addEventListener('click', () => showSection('profileSection'));
      }
      if (openListNavigationStat) {
        openListNavigationStat.addEventListener('click', openListNavigationDialog);
      }
      if (openBalanceListButton) {
        openBalanceListButton.addEventListener('click', openBalanceListDialog);
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
      if (openSelectListDialogButton) {
        openSelectListDialogButton.addEventListener('click', selectListDialog);
      }
      if (toggleSelectAllButton) {
        toggleSelectAllButton.addEventListener('click', toggleSelectAll);
      }
      if (deleteSelectedListItemsButton) {
        deleteSelectedListItemsButton.addEventListener('click', deleteSelectedListItems);
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
      if (selectChosenListsButton) {
        selectChosenListsButton.addEventListener('click', selectChosenLists);
      }
      if (closeSelectListDialogButton) {
        closeSelectListDialogButton.addEventListener('click', () => closeDialog('selectListDialog'));
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
      if (closeShareListDialogButton) {
        closeShareListDialogButton.addEventListener('click', () => closeDialog('shareListDialog'));
      }
      if (navigateToSelectedListButton) {
        navigateToSelectedListButton.addEventListener('click', navigateToSelectedList);
      }
      if (closeListNavigationDialogButton) {
        closeListNavigationDialogButton.addEventListener('click', () => closeDialog('listNavigationDialog'));
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
    initializeFirebaseSync();
    setupDialogOverlayClose();
    setupEventHandlers();
    setupListButtons();
    updateHistory();
    updateBalance();
    showSection('homeSection'); // Definir a seção inicial para visitante
  