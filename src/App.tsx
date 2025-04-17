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
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
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

  // Firestore'dan ilk sayfa ürünleri yükleme
  const fetchProducts = useCallback(async (isFirstPage = true) => {
    setLoading(true);
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
        return;
      }
      
      const productsSnapshot = await getDocs(productsQuery);
      
      // Son belgeyi sonraki sayfalama için saklayın
      const lastDoc = productsSnapshot.docs[productsSnapshot.docs.length - 1];
      setLastVisible(lastDoc || null);
      
      // Daha fazla sayfa var mı kontrol edin
      setHasMore(productsSnapshot.docs.length === pageSize);
      
      const productsList = productsSnapshot.docs.map(doc => ({
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
      alert('Ürünleri yüklerken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [lastVisible, pageSize]);

  // Ürün arama fonksiyonu
  const searchProducts = async () => {
    if (!searchTerm.trim()) {
      // Arama terimi yoksa tüm ürünleri göster
      fetchProducts();
      return;
    }

    setLoading(true);
    try {
      // Arama teriminin küçük/büyük harf duyarlılığını azaltmak için
      const searchTermLower = searchTerm.toLowerCase();
      
      // Firestore tam metin araması desteklemediği için tüm ürünleri çekip
      // JavaScript ile filtreliyoruz (küçük uygulamalar için uygundur)
      const productsCollection = collection(db, 'products');
      const productsSnapshot = await getDocs(productsCollection);
      
      const allProducts = productsSnapshot.docs.map(doc => ({
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
      alert('Ürünleri ararken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  // Eğer giriş yapıldıysa ürünleri yükle
  useEffect(() => {
    if (isLoggedIn) {
      fetchProducts();
    }
  }, [isLoggedIn, fetchProducts]);

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
  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchProducts(false);
    }
  };

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
                }} className="add-btn">
                  Yeni Ürün Ekle
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

              {loading && <div className="loading-indicator">Yükleniyor...</div>}

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
