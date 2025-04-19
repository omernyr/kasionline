import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import Papa from 'papaparse';
import { db } from './firebase';
import { 
  collection, getDocs, addDoc, deleteDoc, doc, updateDoc, query, 
  orderBy, limit, startAfter, writeBatch, DocumentData, 
  QueryDocumentSnapshot 
} from 'firebase/firestore';
import logo from './LOGO.jpg';

// Define product interface
interface Product {
  id: string;
  barcode: string;
  name: string;
  stock: number;
  price: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Stok sayım ürünleri için interface
interface StockCountItem {
  barcode: string;
  quantity: number;
  name?: string;
  price?: number;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    // localStorage'dan giriş durumunu kontrol et
    const savedLoginState = localStorage.getItem('isLoggedIn');
    return savedLoginState === 'true';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Stok sayımı için state değişkenleri
  const [showStockCount, setShowStockCount] = useState(false);
  const [stockItems, setStockItems] = useState<StockCountItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [quantityInput, setQuantityInput] = useState(1);
  const [stockCountSuccess, setStockCountSuccess] = useState<string | null>(null);
  
  // Sayfalama için state değişkenleri
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [pageSize] = useState(50); // Bir sayfada gösterilecek ürün sayısı
  
  // New product form state
  const [newProduct, setNewProduct] = useState<Omit<Product, 'id'>>({
    barcode: '',
    name: '',
    stock: 0,
    price: 0
  });

  // Hardcoded admin credentials
  const ADMIN_USERNAME = 'kasi0101';
  const ADMIN_PASSWORD = 'kasi0147';

  // Internet bağlantısı kontrolü
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Firestore'dan ilk sayfa ürünleri yükleme
  const fetchProducts = useCallback(async (isFirstPage = true) => {
    // Loading kontrolü - önceki fetching işlemi devam ediyorsa yeni istek yapma
    if (loading) {
      console.log('Zaten yükleniyor, yeni istek engellendi');
      return;
    }
    
    if (!isOnline) {
      setLoadingError('İnternet bağlantısı yok. Lütfen bağlantınızı kontrol edin.');
      return;
    }
    
    // Loading durumunu true olarak ayarla
    setLoading(true);
    setLoadingError(null);
    
    // Zaman aşımı oluşturucu
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Zaman aşımı')), 15000); // 15 saniye
    });
    
    try {
      let productsQuery;
      
      if (isFirstPage) {
        // İlk sayfa için sorgu
        productsQuery = query(
          collection(db, 'products'),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
      } else if (lastVisible) {
        // Sonraki sayfalar için sorgu
        productsQuery = query(
          collection(db, 'products'),
          orderBy('createdAt', 'desc'),
          startAfter(lastVisible),
          limit(pageSize)
        );
      } else {
        // Son sayfa zaten yüklenmişse işlemi durdur
        setLoading(false);
        // Zaman aşımını iptal et
        if (timeoutId) clearTimeout(timeoutId);
        return;
      }
      
      // Zaman aşımı ile birlikte sorguyu çalıştır
      const productsPromise = getDocs(productsQuery);
      const productsSnapshot = await Promise.race([productsPromise, timeoutPromise]) as any;
      
      // Zaman aşımını iptal et
      if (timeoutId) clearTimeout(timeoutId);
      
      // Son belgeyi sonraki sayfalama için saklayın
      const lastDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      setLastVisible(lastDoc || null);
      
      // Daha fazla sayfa var mı kontrol edin
      setHasMore(productsSnapshot.docs.length === pageSize);
      
      const productsList = productsSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      
      if (isFirstPage) {
        // İlk sayfaysa ürünleri sıfırla
        setProducts(productsList);
      } else {
        // Sonraki sayfaysa ürünleri ekle
        setProducts(prevProducts => [...prevProducts, ...productsList]);
      }
    } catch (error) {
      console.error('Ürünleri yükleme hatası:', error);
      // Hata durumunda boş ürün listesi göster ve loading durumunu kapat
      if (isFirstPage) {
        setProducts([]);
        setHasMore(false);
      }
      if ((error as Error).message === 'Zaman aşımı') {
        setLoadingError('Veritabanı yanıt vermiyor. Lütfen internet bağlantınızı kontrol edin.');
      } else {
        setLoadingError('Ürünler yüklenirken bir hata oluştu.');
      }
    } finally {
      // İşlem bittiğinde loading durumunu kapat
      setLoading(false);
    }
  }, [lastVisible, pageSize, isOnline]);

  // Ürün arama fonksiyonu
  const searchProducts = useCallback(async () => {
    if (loading) return; // Zaten yükleme yapılıyorsa işlemi durdur
    
    if (!searchTerm.trim()) {
      // Arama terimi yoksa tüm ürünleri göster
      fetchProducts();
      return;
    }

    setLoading(true);
    setLoadingError(null);
    
    try {
      // Arama teriminin küçük/büyük harf duyarlılığını azaltmak için
      const searchTermLower = searchTerm.toLowerCase();
      
      // Firestore tam metin araması desteklemediği için tüm ürünleri çekip
      // JavaScript ile filtreliyoruz (küçük uygulamalar için uygundur)
      const productsCollection = collection(db, 'products');
      const productsSnapshot = await getDocs(productsCollection);
      
      const allProducts = productsSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      
      // İsim veya barkod ile filtreleme
      const filteredProducts = allProducts.filter(product => 
        product.name.toLowerCase().includes(searchTermLower) || 
        product.barcode.toLowerCase().includes(searchTermLower)
      );
      
      setProducts(filteredProducts);
      // Sayfalama değişkenlerini sıfırla
      setLastVisible(null);
      setHasMore(false);
    } catch (error) {
      console.error('Ürün arama hatası:', error);
      // Hata durumunda boş liste göster
      setProducts([]);
      setHasMore(false);
      setLoadingError('Ürünleri ararken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, loading, fetchProducts, db]);

  // Eğer giriş yapıldıysa ürünleri yükle
  useEffect(() => {
    let isMounted = true;
    let isLoading = false; // useEffect içinde yerel bir loading flag'i kullan
    
    // fetchProducts fonksiyonunun içinde başka bir async fonksiyon olarak tanımla
    // React state döngülerinden kaçınmak için
    const loadProducts = async () => {
      if (isLoading || !isMounted || !isLoggedIn) return;
      
      isLoading = true;
      console.log('Ürünler yükleniyor...');
      
      try {
        const productsQuery = query(
          collection(db, 'products'),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
        
        const productsSnapshot = await getDocs(productsQuery);
        
        if (!isMounted) return; // Bileşen unmount edildiyse işlemi durdur
        
        // Son belgeyi sonraki sayfalama için saklayın
        const lastDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1];
        setLastVisible(lastDoc || null);
        
        // Daha fazla sayfa var mı kontrol edin
        setHasMore(productsSnapshot.docs.length === pageSize);
        
        const productsList = productsSnapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];
        
        // Ürünleri state'e set et
        setProducts(productsList);
      } catch (error) {
        console.error('İlk yükleme hatası:', error);
        if (isMounted) {
          setProducts([]);
          setHasMore(false);
          setLoadingError('Ürünler yüklenirken bir hata oluştu.');
        }
      } finally {
        if (isMounted) setLoading(false);
        isLoading = false;
      }
    };
    
    // İlk yükleme işlemi için çağır
    if (isLoggedIn && isMounted && !isLoading) {
      loadProducts();
    }
    
    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, pageSize, db]);

  // Save login state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('isLoggedIn', isLoggedIn.toString());
  }, [isLoggedIn]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      setError('');
    } else {
      setError('Geçersiz kullanıcı adı veya şifre');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Enter tuşuna basınca arama yap
  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchProducts();
    }
  };

  // Arama butonuna tıklanınca arama yap
  const handleSearchClick = () => {
    searchProducts();
  };

  // Daha fazla ürün yükle
  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      console.log('Daha fazla ürün yükleniyor...');
      fetchProducts(false);
    }
  }, [loading, hasMore, fetchProducts]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Firestore'a yeni ürün ekleme
      const docRef = await addDoc(collection(db, 'products'), {
        barcode: newProduct.barcode,
        name: newProduct.name,
        stock: newProduct.stock,
        price: newProduct.price,
        createdAt: new Date()
      });
      
      // Eklenen ürünü listeye dahil et
      const addedProduct = { 
        id: docRef.id, 
        ...newProduct,
        createdAt: new Date()
      };
      
      setProducts([addedProduct, ...products]);
      setNewProduct({ barcode: '', name: '', stock: 0, price: 0 });
      setShowAddForm(false);
      alert('Ürün başarıyla eklendi!');
    } catch (error) {
      console.error('Ürün ekleme hatası:', error);
      alert('Ürün eklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('Bu ürünü silmek istediğinizden emin misiniz?')) {
      setLoading(true);
      try {
        // Firestore'dan ürünü silme
        await deleteDoc(doc(db, 'products', id));
        
        // Ürünü listeden kaldır
        setProducts(products.filter(product => product.id !== id));
        alert('Ürün başarıyla silindi!');
      } catch (error) {
        console.error('Ürün silme hatası:', error);
        alert('Ürün silinirken bir hata oluştu. Lütfen tekrar deneyin.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setNewProduct({
      barcode: product.barcode,
      name: product.name,
      stock: product.stock,
      price: product.price
    });
    setShowAddForm(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    setLoading(true);
    try {
      // Firestore'da ürünü güncelleme
      const productRef = doc(db, 'products', editingProduct.id);
      const updatedAt = new Date();
      
      await updateDoc(productRef, {
        barcode: newProduct.barcode,
        name: newProduct.name,
        stock: newProduct.stock,
        price: newProduct.price,
        updatedAt
      });
      
      // Listede ürünü güncelleme
      setProducts(products.map(product => 
        product.id === editingProduct.id 
          ? { 
              ...product, 
              ...newProduct,
              updatedAt
            } 
          : product
      ));
      
      setNewProduct({ barcode: '', name: '', stock: 0, price: 0 });
      setEditingProduct(null);
      setShowAddForm(false);
      alert('Ürün başarıyla güncellendi!');
    } catch (error) {
      console.error('Ürün güncelleme hatası:', error);
      alert('Ürün güncellenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      transformHeader: (header) => {
        // Başlıkları normalleştir
        return header
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")  // Aksan işaretlerini kaldır
          .trim();
      },
      complete: async (results) => {
        try {
          const importedProducts: Omit<Product, 'id'>[] = [];
          
          results.data.forEach((row: any) => {
            // Anahtar isimleri için tüm olası varyasyonları kontrol et (küçük/büyük harf ve Türkçe karakterler)
            const getFieldValue = (fieldName: string): string => {
              const possibleKeys = [
                fieldName.toLowerCase(),
                fieldName.toUpperCase(),
                fieldName[0].toUpperCase() + fieldName.slice(1).toLowerCase(),
                // Türkçe karakter alternatifleri
                fieldName.replace(/ı/g, "i").replace(/İ/g, "I").replace(/ş/g, "s").replace(/Ş/g, "S")
                  .replace(/ğ/g, "g").replace(/Ğ/g, "G").replace(/ü/g, "u").replace(/Ü/g, "U")
                  .replace(/ö/g, "o").replace(/Ö/g, "O").replace(/ç/g, "c").replace(/Ç/g, "C")
              ];
              
              for (const key of possibleKeys) {
                if (row[key] !== undefined) {
                  return String(row[key]).trim();
                }
              }
              return "";
            };
            
            const barcode = getFieldValue("barcode") || getFieldValue("barkod");
            const name = getFieldValue("name") || getFieldValue("isim") || getFieldValue("urun") || getFieldValue("ürün");
            const stock = parseInt(getFieldValue("stock") || getFieldValue("stok") || "0") || 0;
            const price = parseFloat(getFieldValue("price") || getFieldValue("fiyat") || "0") || 0;
            
            if (barcode || name) {
              importedProducts.push({
                barcode,
                name,
                stock,
                price
              });
            }
          });
          
          if (importedProducts.length > 0) {
            // Toplu işlemle Firestore'a ürünleri ekle (daha verimli)
            const batch = writeBatch(db);
            const newProducts: Product[] = [];
            
            // Maksimum 500 işlem yapılabilir (Firestore sınırı)
            const maxBatchSize = 500;
            
            for (let i = 0; i < importedProducts.length; i += maxBatchSize) {
              const chunk = importedProducts.slice(i, i + maxBatchSize);
              
              for (const product of chunk) {
                const docRef = doc(collection(db, 'products'));
                const timestamp = new Date();
                
                batch.set(docRef, {
                  ...product,
                  createdAt: timestamp
                });
                
                newProducts.push({
                  id: docRef.id,
                  ...product,
                  createdAt: timestamp
                });
              }
              
              // Her 500 işlemde bir commit yapın
              await batch.commit();
            }
            
            // Yeni ürünleri state'e ekle
            setProducts(prevProducts => [...newProducts, ...prevProducts]);
            alert(`${importedProducts.length} ürün başarıyla içe aktarıldı.`);
            
            // Listeyi güncelle
            fetchProducts();
          } else {
            alert('Dosyada geçerli ürün bulunamadı.');
          }
        } catch (error) {
          console.error('İçe aktarma hatası:', error);
          alert('Ürünler içe aktarılırken bir hata oluştu. Lütfen tekrar deneyin.');
        } finally {
          setLoading(false);
        }
      },
      error: (error) => {
        alert('Dosya okuma hatası: ' + error.message);
        console.error('Ayrıştırma hatası:', error);
        setLoading(false);
      }
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewProduct({
      ...newProduct,
      [name]: name === 'stock' || name === 'price' ? parseFloat(value) : value
    });
  };

  const handleDownloadTemplate = () => {
    const headers = ['Barkod', 'İsim', 'Stok', 'Fiyat'];
    const sampleData = [
      ['1234567890', 'Örnek Ürün 1', '10', '29.99'],
      ['0987654321', 'Örnek Ürün 2 (Türkçe Karakterler: ÇŞĞÜÖİ)', '5', '19.99']
    ];
    
    // BOM karakteri ekleyerek UTF-8 olduğunu belirt
    const BOM = '\uFEFF';
    const csvContent = BOM + [
      headers.join(','),
      ...sampleData.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'urun_sablonu.csv');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Stok sayım işlemleri
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!barcodeInput.trim()) return;
    
    // Barkod için mevcut ürünü kontrol et
    const existingItemIndex = stockItems.findIndex(item => item.barcode === barcodeInput);
    
    if (existingItemIndex >= 0) {
      // Mevcut ürünün miktarını artır
      const updatedItems = [...stockItems];
      updatedItems[existingItemIndex].quantity += quantityInput;
      setStockItems(updatedItems);
    } else {
      // Yeni ürün ekle
      setStockItems([...stockItems, {
        barcode: barcodeInput,
        quantity: quantityInput
      }]);
    }
    
    // Stok sayım başarılı mesajı göster
    setStockCountSuccess(`Barkod ${barcodeInput} eklendi: ${quantityInput} adet`);
    
    // Timeout ile mesajı kaldır
    setTimeout(() => {
      setStockCountSuccess(null);
    }, 2000);
    
    // Inputları sıfırla
    setBarcodeInput('');
    setQuantityInput(1);
    
    // Otomatik olarak barkod input alanına odaklan
    const barcodeInputEl = document.getElementById('barcode-input');
    if (barcodeInputEl) {
      barcodeInputEl.focus();
    }
  };
  
  // Stok sayımından ürün sil
  const handleRemoveStockItem = (barcode: string) => {
    setStockItems(stockItems.filter(item => item.barcode !== barcode));
  };
  
  // Stok sayım verilerini kaydet
  const handleSaveStockCount = async () => {
    if (stockItems.length === 0) {
      alert('Kaydetmek için en az bir ürün ekleyin.');
      return;
    }
    
    setLoading(true);
    
    try {
      // Toplu işlem oluştur
      const batch = writeBatch(db);
      let addedCount = 0;
      
      // Her ürün için
      for (const item of stockItems) {
        // Mevcut ürünü kontrol et
        const existingProduct = products.find(p => p.barcode === item.barcode);
        
        if (existingProduct) {
          // Mevcut ürünün stoğunu güncelle
          const productRef = doc(db, 'products', existingProduct.id);
          batch.update(productRef, {
            stock: item.quantity,
            updatedAt: new Date()
          });
        } else {
          // Yeni ürün oluştur (isim ve fiyat boş)
          const newProductRef = doc(collection(db, 'products'));
          batch.set(newProductRef, {
            barcode: item.barcode,
            name: '',
            stock: item.quantity,
            price: 0,
            createdAt: new Date()
          });
        }
        
        addedCount++;
      }
      
      // Batch işlemini gerçekleştir
      await batch.commit();
      
      // Başarılı mesajı göster
      alert(`${addedCount} ürün başarıyla kaydedildi.`);
      
      // Stok sayımı sıfırla
      setStockItems([]);
      
      // Ürün listesini güncelle
      fetchProducts();
      
      // Stok sayım modunu kapat
      setShowStockCount(false);
    } catch (error) {
      console.error('Stok kaydetme hatası:', error);
      alert('Stok kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };
  
  // Stok sayım CSV dışa aktarma
  const handleExportStockCSV = () => {
    if (stockItems.length === 0) {
      alert('Dışa aktarmak için en az bir ürün ekleyin.');
      return;
    }
    
    // Stok sayım öğelerini CSV formatına dönüştür
    const headers = ['Barkod', 'Miktar'];
    const csvRows = [
      headers.join(','),
      ...stockItems.map(item => `${item.barcode},${item.quantity}`)
    ];
    
    // BOM karakterini ekle (UTF-8 encoding)
    const BOM = '\uFEFF';
    const csvContent = BOM + csvRows.join('\n');
    
    // CSV dosyasını indir
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `stok_sayim_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoggedIn) {
    return (
      <div className="App">
        <header className="App-header">
          <div className="dashboard-container">
            <div className="dashboard-header">
              <h1>
                <img src={logo} alt="Logo" className="logo" />
                Ürün Yönetim Paneli
              </h1>
              <button onClick={handleLogout} className="logout-btn">Çıkış</button>
            </div>
            
            <div className="dashboard-content">
              <div className="actions-bar">
                <button onClick={() => {
                  setEditingProduct(null);
                  setNewProduct({ barcode: '', name: '', stock: 0, price: 0 });
                  setShowAddForm(true);
                  setShowStockCount(false);
                }} className="add-btn">
                  Yeni Ürün Ekle
                </button>
                
                <button onClick={() => {
                  setShowStockCount(!showStockCount);
                  setShowAddForm(false);
                  setBarcodeInput('');
                  setQuantityInput(1);
                  // Barkod okuyucu modunu açtığında otomatik olarak odaklan
                  if (!showStockCount) {
                    setTimeout(() => {
                      const barcodeInputEl = document.getElementById('barcode-input');
                      if (barcodeInputEl) {
                        barcodeInputEl.focus();
                      }
                    }, 100);
                  }
                }} className={`stock-count-btn ${showStockCount ? 'active' : ''}`}>
                  {showStockCount ? 'Stok Sayımı Kapat' : 'Stok Sayımı Aç'}
                </button>
                
                <div className="import-container">
                  <label htmlFor="excel-import" className="import-btn">Excel İçe Aktar</label>
                  <input 
                    type="file" 
                    id="excel-import" 
                    accept=".csv,.xlsx,.xls" 
                    onChange={handleExcelImport}
                    style={{ display: 'none' }}
                  />
                  <button onClick={handleDownloadTemplate} className="template-btn">
                    Şablon İndir
                  </button>
                </div>
                
                <div className="search-container">
                  <input
                    type="text"
                    placeholder="Ürün ara..."
                    value={searchTerm}
                    onChange={handleSearch}
                    onKeyPress={handleSearchKeyPress}
                    className="search-input"
                  />
                  <button onClick={handleSearchClick} className="search-btn">
                    Ara
                  </button>
                </div>
              </div>

              {loading && (
                <div className="loading-indicator">
                  <span>Yükleniyor...</span>
                </div>
              )}
              
              {loadingError && (
                <div className="error-message">
                  <p>{loadingError}</p>
                  <button 
                    onClick={() => {
                      setLoadingError(null);
                      fetchProducts();
                    }}
                    className="retry-btn"
                  >
                    Tekrar Dene
                  </button>
                </div>
              )}
              
              {/* Stok Sayım Modülü */}
              {showStockCount && (
                <div className="stock-count-container">
                  <h2>Stok Sayım Modülü</h2>
                  <p className="stock-count-info">
                    Barkod okuyucu ile ürünleri okutun. Aynı barkodlu ürünler otomatik olarak toplanacaktır.
                  </p>
                  
                  <form onSubmit={handleBarcodeSubmit} className="barcode-form">
                    <div className="form-group">
                      <label htmlFor="barcode-input">Barkod</label>
                      <input
                        type="text"
                        id="barcode-input"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        placeholder="Barkod numarası..."
                        autoComplete="off"
                        autoFocus
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="quantity-input">Adet</label>
                      <input
                        type="number"
                        id="quantity-input"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(parseInt(e.target.value) || 1)}
                        min="1"
                        required
                      />
                    </div>
                    
                    <button type="submit" className="add-barcode-btn">Ekle</button>
                  </form>
                  
                  {stockCountSuccess && (
                    <div className="success-message">{stockCountSuccess}</div>
                  )}
                  
                  {stockItems.length > 0 ? (
                    <>
                      <div className="stock-items-list">
                        <h3>Eklenen Ürünler ({stockItems.length})</h3>
                        <div className="stock-list-header">
                          <span>Barkod</span>
                          <span>Adet</span>
                          <span>İşlem</span>
                        </div>
                        {stockItems.map((item) => (
                          <div key={item.barcode} className="stock-item">
                            <span className="stock-barcode">{item.barcode}</span>
                            <span className="stock-quantity">{item.quantity}</span>
                            <button 
                              onClick={() => handleRemoveStockItem(item.barcode)}
                              className="stock-remove-btn"
                            >
                              Sil
                            </button>
                          </div>
                        ))}
                      </div>
                      
                      <div className="stock-actions">
                        <button 
                          onClick={handleSaveStockCount} 
                          className="save-stock-btn"
                          disabled={loading}
                        >
                          Kaydet
                        </button>
                        <button 
                          onClick={handleExportStockCSV}
                          className="export-stock-btn"
                        >
                          CSV Olarak İndir
                        </button>
                        <button 
                          onClick={() => {
                            if (window.confirm('Tüm eklenen ürünleri silmek istediğinize emin misiniz?')) {
                              setStockItems([]);
                            }
                          }}
                          className="clear-stock-btn"
                        >
                          Tümünü Temizle
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="empty-stock-items">
                      Henüz ürün eklenmedi. Barkod okutmaya başlayın.
                    </div>
                  )}
                </div>
              )}
              
              {!loading && !loadingError && products.length === 0 && !showStockCount && (
                <div className="empty-state">
                  Ürün bulunamadı. Yeni bir ürün ekleyin veya Excel'den içe aktarın.
                </div>
              )}

              {showAddForm && (
                <div className="form-container">
                  <h2>{editingProduct ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}</h2>
                  <form onSubmit={editingProduct ? handleUpdateProduct : handleAddProduct}>
                    <div className="form-group">
                      <label htmlFor="barcode">Barkod</label>
                      <input
                        type="text"
                        id="barcode"
                        name="barcode"
                        value={newProduct.barcode}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="name">İsim</label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={newProduct.name}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="stock">Stok</label>
                      <input
                        type="number"
                        id="stock"
                        name="stock"
                        value={newProduct.stock}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="price">Fiyat</label>
                      <input
                        type="number"
                        id="price"
                        name="price"
                        step="0.01"
                        value={newProduct.price}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="form-buttons">
                      <button type="submit" disabled={loading}>{editingProduct ? 'Güncelle' : 'Ekle'}</button>
                      <button type="button" onClick={() => setShowAddForm(false)}>İptal</button>
                    </div>
                  </form>
                </div>
              )}
              
              <div className="stats-bar">
                <div className="stat-item">
                  <span className="stat-label">Toplam Ürün:</span>
                  <span className="stat-value">{products.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Toplam Stok:</span>
                  <span className="stat-value">
                    {products.reduce((total, product) => total + product.stock, 0)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Toplam Değer:</span>
                  <span className="stat-value">
                    {products
                      .reduce((total, product) => total + (product.price * product.stock), 0)
                      .toFixed(2)} ₺
                  </span>
                </div>
              </div>
              
              <div className="product-list">
                <table>
                  <thead>
                    <tr>
                      <th>Barkod</th>
                      <th>İsim</th>
                      <th>Stok</th>
                      <th>Fiyat</th>
                      <th>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => (
                      <tr key={product.id}>
                        <td>{product.barcode}</td>
                        <td>{product.name}</td>
                        <td>{product.stock}</td>
                        <td>{product.price.toFixed(2)} ₺</td>
                        <td>
                          <button onClick={() => handleEditProduct(product)} className="edit-btn" disabled={loading}>Düzenle</button>
                          <button onClick={() => handleDeleteProduct(product.id)} className="delete-btn" disabled={loading}>Sil</button>
                        </td>
                      </tr>
                    ))}
                    {products.length === 0 && !loading && (
                      <tr>
                        <td colSpan={5}>Ürün bulunamadı. Yeni bir ürün ekleyin veya Excel'den içe aktarın.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                
                {hasMore && (
                  <div className="load-more-container">
                    <button 
                      onClick={handleLoadMore} 
                      className="load-more-btn"
                      disabled={loading}
                    >
                      Daha Fazla Yükle
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="login-container">
        <img src={logo} alt="Logo" className="login-logo" />
        <h1 className="login-title">Yönetici Girişi</h1>
        <form onSubmit={handleLogin} className="login-form">
          {error && <p className="error-message">{error}</p>}
          <div className="form-group">
            <label htmlFor="username">Kullanıcı Adı</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Şifre</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit">Giriş</button>
        </form>
      </div>
    </div>
  );
}

export default App;
