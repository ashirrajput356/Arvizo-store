import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft,
  ChevronRight, Heart, Instagram, Leaf, LockKeyhole, Menu, Minus, PackageCheck, RefreshCw,
  Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Star, Truck, X,
} from 'lucide-react'

const FALLBACK = '/images/fallback.svg'
const SUPPORT_PHONE = '+923368915598'
const SUPPORT_WA = '923368915598'
const STORE_EMAIL = 'arvizostore@gmail.com'
const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled']
const money = (value) => `Rs. ${Number(value || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const karachiMonth = () => {
  const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Karachi' }).formatToParts(new Date())
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`
}
const waLink = `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent('Hello Arvizo, I need a little help.')}`

function BrandLogo({ className = '' }) {
  return <img className={`brand-logo ${className}`} src="/images/arvizo-logo.png" alt="Arvizo — Shop Smart. Live Better." />
}

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { credentials: 'same-origin', ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

function Image({ src, alt = '', className = '', ...props }) {
  const [image, setImage] = useState(src || FALLBACK)
  useEffect(() => setImage(src || FALLBACK), [src])
  return <img src={image} alt={alt} className={className} onError={() => setImage(FALLBACK)} {...props} />
}

function App() {
  const [isAdmin, setIsAdmin] = useState(window.location.pathname.startsWith('/admin'))
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [page, setPage] = useState('home')
  const [bag, setBag] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('arvizo-bag') || '[]')
      return Array.isArray(stored) ? stored.filter((item) => item && Number.isInteger(Number(item.id)) && Number.isInteger(item.quantity) && item.quantity > 0) : []
    } catch { return [] }
  })
  const [bagOpen, setBagOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [quickView, setQuickView] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [sort, setSort] = useState('featured')
  const [maxPrice, setMaxPrice] = useState(30000)
  const [visibleCount, setVisibleCount] = useState(8)
  const [toast, setToast] = useState('')

  const refreshStore = async () => {
    try {
      const [p, c] = await Promise.all([api('products'), api('categories')])
      setProducts(p.products || [])
      setCategories(c.categories || [])
    } catch (error) {
      setToast(`Store connection: ${error.message}`)
    }
  }
  useEffect(() => { refreshStore() }, [])
  useEffect(() => { localStorage.setItem('arvizo-bag', JSON.stringify(bag)) }, [bag])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3600)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const onPop = () => setIsAdmin(window.location.pathname.startsWith('/admin'))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const headerProps = () => ({ page, navigate, bagCount, setBagOpen, searchOpen, setSearchOpen, search, setSearch, mobileOpen, setMobileOpen })

  const bagCount = bag.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = bag.reduce((sum, item) => sum + Number(item.sale_price ?? item.price) * item.quantity, 0)
  const delivery = bag.length ? 300 : 0

  function goStore() {
    history.pushState({}, '', '/')
    setIsAdmin(false)
  }
  function navigate(next, options = {}) {
    setPage(next)
    if (Object.hasOwn(options, 'category')) setFilterCategory(options.category)
    if (next === 'shop') setVisibleCount(8)
    setMobileOpen(false)
    setBagOpen(false)
    setQuickView(null)
    setConfirmation(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function addToBag(product, quantity = 1) {
    setBag((items) => {
      const found = items.find((item) => item.id === product.id)
      return found
        ? items.map((item) => item.id === product.id ? { ...item, quantity: Math.min(Number(product.stock || 99), item.quantity + quantity) } : item)
        : [...items, { ...product, quantity: Math.min(Number(product.stock || 99), quantity) }]
    })
    setToast(`${product.name} added to your bag`)
    setQuickView(null)
  }
  function changeQuantity(id, delta) {
    setBag((items) => items.map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0))
  }
  function buyNow(product) {
    addToBag(product)
    setPage('checkout')
    setQuickView(null)
    setBagOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filteredProducts = useMemo(() => {
    let result = products.filter((product) => {
      const term = search.trim().toLowerCase()
      return (!term || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(term))
        && (!filterCategory || String(product.category_id) === String(filterCategory))
        && Number(product.sale_price ?? product.price) <= maxPrice
    })
    if (sort === 'newest') result = [...result].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (sort === 'price-low') result = [...result].sort((a, b) => Number(a.sale_price ?? a.price) - Number(b.sale_price ?? b.price))
    if (sort === 'price-high') result = [...result].sort((a, b) => Number(b.sale_price ?? b.price) - Number(a.sale_price ?? a.price))
    if (sort === 'rating') result = [...result].sort((a, b) => Number(b.rating) - Number(a.rating))
    return result
  }, [products, search, filterCategory, sort, maxPrice])

  if (isAdmin) return <Admin onBack={goStore} toast={setToast} />
  if (confirmation) return <><Header {...headerProps()} /><Confirmation order={confirmation} goHome={() => navigate('home')} trackOrder={() => navigate('track')} /><Footer navigate={navigate} /></>

  return (
    <div className="app-shell">
      <Header {...headerProps()} />
      {searchOpen && <div className="search-bar"><Search size={17} /><input autoFocus value={search} onChange={(e) => { setSearch(e.target.value); setPage('shop') }} placeholder="Find something lovely..." /><button className="icon-button" onClick={() => { setSearchOpen(false); setSearch('') }} aria-label="Close search"><X size={18} /></button></div>}
      {page === 'home' && <Home products={products} categories={categories} navigate={navigate} openProduct={setQuickView} addToBag={addToBag} toast={setToast} />}
      {page === 'shop' && (
        <main className="page-wrap shop-page">
          <div className="eyebrow">ARVIZO WATCHES & AUDIO</div><h1>Time well spent, <em>sound well heard.</em></h1>
          <p className="page-intro">Shop statement watches and everyday earbuds, delivered across Pakistan.</p>
          <div className="shop-controls">
            <label className="filter-select"><span>Category</span><select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={15} /></label>
            <label className="filter-select"><span>Sort by</span><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="featured">Featured</option><option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="rating">Top rated</option></select><ChevronDown size={15} /></label>
            <label className="price-filter"><span>Up to {money(maxPrice)}</span><input type="range" min="500" max="30000" step="500" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} /></label>
            <span className="result-count">{filteredProducts.length} lovely finds</span>
          </div>
          {filteredProducts.length ? <ProductGrid products={filteredProducts.slice(0, visibleCount)} openProduct={setQuickView} addToBag={addToBag} /> : <div className="empty-state"><span className="empty-icon"><Search /></span><h3>Nothing in this little corner yet</h3><p>Try a different search or loosen up your filters.</p><button className="button button-outline" onClick={() => { setSearch(''); setFilterCategory(''); setMaxPrice(30000) }}>Clear filters</button></div>}
          {visibleCount < filteredProducts.length && <button className="button button-outline load-more" onClick={() => setVisibleCount((n) => n + 8)}>Show me more <ArrowDown size={16} /></button>}
        </main>
      )}
      {page === 'checkout' && <Checkout bag={bag} subtotal={subtotal} changeQuantity={changeQuantity} navigate={navigate} onOrder={(order) => { setConfirmation(order); setBag([]); window.scrollTo(0, 0); refreshStore() }} toast={setToast} />}
      {page === 'track' && <TrackOrderPage />}
      {page === 'contact' && <SupportPage />}
      {page === 'story' && <StoryPage navigate={navigate} />}
      <Footer navigate={navigate} />
      {bagOpen && <BagDrawer bag={bag} subtotal={subtotal} delivery={delivery} setBagOpen={setBagOpen} navigate={navigate} changeQuantity={changeQuantity} />}
      {quickView && <ProductModal product={quickView} products={products} addToBag={addToBag} buyNow={buyNow} openProduct={setQuickView} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  )
}

function Header({ page, navigate, bagCount, setBagOpen, searchOpen, setSearchOpen, search, setSearch, mobileOpen, setMobileOpen }) {
  const links = [['Home', 'home'], ['Shop', 'shop'], ['Categories', 'categories'], ['Our Orders', 'track'], ['Our Story', 'story'], ['Contact', 'contact']]
  return <>
    <header className="site-header">
      <button className="icon-button mobile-menu-toggle" aria-label="Open menu" onClick={() => setMobileOpen((o) => !o)}>{mobileOpen ? <X /> : <Menu />}</button>
      <a href="/" className="wordmark" aria-label="Arvizo home" onClick={(e) => { e.preventDefault(); navigate('home') }}><BrandLogo /></a>
      <nav className={`main-nav ${mobileOpen ? 'is-open' : ''}`}>
        {links.map(([label, target]) => <button key={label} className={page === target ? 'active' : ''} onClick={() => {
          if (target === 'categories') {
            setMobileOpen(false)
            const section = document.getElementById('categories')
            if (section) section.scrollIntoView({ behavior: 'smooth' })
            else { navigate('home'); setTimeout(() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' }), 80) }
          } else navigate(target)
        }}>{label}</button>)}
      </nav>
      <div className="header-actions">
        <button className={`icon-button search-toggle ${searchOpen ? 'selected' : ''}`} onClick={() => setSearchOpen(!searchOpen)} aria-label="Search"><Search size={19} /></button>
        <a className="header-whatsapp" href={waLink} target="_blank" rel="noreferrer">WhatsApp us <ArrowUpRight size={14} /></a>
        <button className="bag-button" onClick={() => setBagOpen(true)} aria-label={`Shopping bag, ${bagCount} items`}><ShoppingBag size={20} /><span>Bag</span><b>{bagCount}</b></button>
      </div>
    </header>
  </>
}

function TrackOrderPage() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadOrders = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await api('orders/public')
      setOrders(result.orders || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { loadOrders() }, [])

  const progress = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered']
  return <main className="track-page page-wrap">
    <div className="track-heading"><span className="eyebrow">ARVIZO STORE ORDERS</span><h1>Track your <em>orders.</em></h1><p>Orders and purchase details are visible to everyone. Customer names, phone numbers, and addresses are not shown.</p></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {busy && <p className="tracked-orders-empty" role="status">Loading orders...</p>}
    {!busy && !error && orders.length === 0 && <p className="tracked-orders-empty">There are no orders yet.</p>}
    {orders.length > 0 && <div className="tracked-orders" aria-live="polite">
      <p className="tracked-orders-count">{orders.length} {orders.length === 1 ? 'order' : 'orders'} found</p>
      {orders.map((order) => {
        const currentStep = progress.indexOf(order.status)
        return <section className="tracked-order" key={order.id}>
          <div className="tracked-order-heading"><div><span className="eyebrow">PLACED {order.created_at}</span><h2>{order.status === 'Cancelled' ? 'Order cancelled' : `Your order is ${order.status.toLowerCase()}.`}</h2></div><span className={`tracked-status ${order.status === 'Cancelled' ? 'is-cancelled' : ''}`}>{order.status}</span></div>
          {order.status !== 'Cancelled' && <div className="order-progress">{progress.map((step, index) => <div className={`progress-step ${index <= currentStep ? 'is-complete' : ''} ${index === currentStep ? 'is-current' : ''}`} key={step}><span>{index < currentStep ? <Check size={13} /> : index + 1}</span><small>{step}</small></div>)}</div>}
          <div className="tracked-items">{order.items.map((item, index) => <div className="tracked-item" key={`${item.name}-${index}`}><Image src={item.image} alt="" /><span>{item.name}<small>Quantity: {item.quantity}</small></span><b>{money(item.unit_price * item.quantity)}</b></div>)}</div>
          <div className="tracked-total"><span>Total · Cash on delivery</span><b>{money(order.total)}</b></div>
          <p className="tracked-support">Need help? <a href={waLink} target="_blank" rel="noreferrer">Contact us on WhatsApp <ArrowUpRight size={14} /></a></p>
        </section>
      })}
    </div>}
  </main>
}

function Home({ products, categories, navigate, openProduct, addToBag, toast }) {
  const featured = products.slice(0, 4)
  const trending = [...products].sort((a, b) => Number(b.review_count) - Number(a.review_count)).slice(0, 4)
  return <main>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><Sparkles size={14} /> DESIGNED FOR YOUR EVERYDAY</div><h1>Make time<br /><em>sound better.</em></h1><p>Discover standout watches and wireless earbuds that bring a little more style to every moment.</p><div className="hero-buttons"><button className="button button-dark" onClick={() => navigate('shop')}>Shop watches & audio <ArrowRight size={16} /></button><button className="button button-text" onClick={() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' })}>Explore collections <ArrowDown size={15} /></button></div><div className="hero-note"><span className="mini-stars">★★★★★</span><span>Style, sound and value — delivered nationwide</span></div></div>
      <div className="hero-visual"><div className="hero-image-main"><Image src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=90" alt="Premium wristwatch photographed in a clean studio" /></div><div className="hero-float-card"><span className="float-icon"><Heart size={17} /></span><div><b>Your next everyday essential</b><span>Thoughtful design. Ready for anywhere.</span></div></div><span className="hero-seal">TIME<br />TO<br />UPGRADE</span><span className="hero-orbit orbit-one"></span><span className="hero-orbit orbit-two"></span></div>
    </section>
    <section className="section categories-section" id="categories"><SectionHeading eyebrow="FIND YOUR NEXT FAVOURITE" title="Shop watches & earbuds" copy="From polished everyday watches to wireless audio made for life on the move." /><div className="category-grid">{categories.map((category, i) => <button className={`category-card category-card-${i % 4}`} key={category.id} onClick={() => navigate('shop', { category: category.id })}><Image src={category.image} alt={category.name} /><span className="category-name">{category.name}<ArrowUpRight size={16} /></span></button>)}</div></section>
    <section className="section product-section"><SectionHeading eyebrow="THE ARVIZO EDIT" title="Time to meet your new favourite" copy="Sharp details, great sound, and everyday prices." action={<button className="text-link" onClick={() => navigate('shop')}>Shop everything <ArrowRight size={15} /></button>} /><ProductGrid products={featured} openProduct={openProduct} addToBag={addToBag} /></section>
    <section className="promise-strip"><div><span><Truck /></span><div><b>Nationwide delivery</b><small>All across Pakistan, Rs. 300 flat</small></div></div><div><span><ShieldCheck /></span><div><b>Thoughtfully selected</b><small>Good quality, no guesswork</small></div></div><div><span><PackageCheck /></span><div><b>Cash on delivery</b><small>Pay when your parcel arrives</small></div></div><div><span><Heart /></span><div><b>Real human support</b><small>Here when you need us</small></div></div></section>
    <section className="section trending-section"><div className="trending-banner"><div><span className="eyebrow">MADE FOR YOUR EVERYDAY</span><h2>Sharp style.<br /><em>Immersive sound.</em></h2><p>Find your rhythm with watches and earbuds designed to keep up with you.</p><button className="button button-dark" onClick={() => navigate('shop')}>Explore the collection <ArrowRight size={15} /></button></div><div className="trending-photo"><Image src="https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=85" alt="Wireless earbuds and charging case" /><span>THE ARVIZO EDIT · 01</span></div></div><ProductGrid products={trending} openProduct={openProduct} addToBag={addToBag} /></section>
    <section className="review-section"><div className="review-intro"><span className="eyebrow">MADE TO GO PLACES</span><h2>Your day,<br />your <em>soundtrack.</em></h2><div className="review-score"><span>★★★★★</span><b>Arvizo picks</b><small>Style and sound for every day</small></div></div><div className="review-cards"><ReviewCard quote="A clean, classic watch that works with everything I wear. Great value and fast delivery." name="Ayesha R." place="Lahore" /><ReviewCard quote="The earbuds pair quickly and sound fantastic for my commute. Really happy with them." name="Mariam K." place="Karachi" /><ReviewCard quote="Exactly what I wanted — stylish, comfortable, and delivered right to my door." name="Zara F." place="Islamabad" /></div></section>
    <section className="newsletter"><div className="newsletter-icon"><Sparkles /></div><span className="eyebrow">A LITTLE NOTE FROM US</span><h2>Good things in your inbox.</h2><p>New finds, thoughtful ideas, and a little something for your next order.</p><Newsletter toast={toast} /><small>No spam, ever. Just the good stuff.</small></section>
  </main>
}

function SectionHeading({ eyebrow, title, copy, action }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>{action}</div>
}

function ProductGrid({ products, openProduct, addToBag }) {
  return <div className="product-grid">{products.map((product, i) => <ProductCard key={product.id} product={product} index={i} openProduct={openProduct} addToBag={addToBag} />)}</div>
}

function ProductCard({ product, index, openProduct, addToBag }) {
  const price = Number(product.sale_price ?? product.price)
  const discount = product.sale_price ? Math.round((1 - Number(product.sale_price) / Number(product.price)) * 100) : 0
  return <article className="product-card" style={{ '--card-index': index % 4 }}><button className="product-photo" onClick={() => openProduct(product)} aria-label={`View ${product.name}`}><Image src={product.image} alt={product.name} loading="lazy" />{discount > 0 && <span className="discount-tag">{discount}% off</span>}<span className="quick-view-hint">Quick look <ArrowUpRight size={13} /></span></button><div className="product-info"><span className="product-category">{product.category || 'Everyday'}</span><button className="product-name" onClick={() => openProduct(product)}>{product.name}</button><div className="rating-line"><span>★</span> {Number(product.rating || 4.8).toFixed(1)} <small>({product.review_count || 0})</small><span className="product-price">{money(price)}{product.sale_price && <del>{money(product.price)}</del>}</span></div><div className="product-actions"><button className="button button-small button-dark" disabled={Number(product.stock) < 1} onClick={() => addToBag(product)}>Add to bag</button><button className="button button-small button-outline" onClick={() => openProduct(product)}>Details</button></div></div></article>
}

function ReviewCard({ quote, name, place }) {
  return <article className="review-card"><div className="review-stars">★★★★★</div><p>“{quote}”</p><div className="review-person"><span className="review-avatar">{name.charAt(0)}</span><div><b>{name}</b><small>{place} · Verified shopper</small></div><Check size={15} /></div></article>
}

function Newsletter({ toast }) {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setBusy(true)
    try { const result = await api('newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); setDone(true); toast(result.message) }
    catch (error) { toast(error.message) } finally { setBusy(false) }
  }
  return done ? <div className="newsletter-success"><Check size={18} /> You're on the list. Lovely to have you.</div> : <form className="newsletter-form" onSubmit={submit}><input required type="email" maxLength="190" placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Your email address" /><button className="button button-dark" disabled={busy}>{busy ? 'Joining...' : 'Count me in'} <ArrowRight size={15} /></button></form>
}

function BagDrawer({ bag, subtotal, delivery, setBagOpen, navigate, changeQuantity }) {
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setBagOpen(false)}><aside className="bag-drawer"><div className="drawer-head"><div><span className="eyebrow">YOUR LITTLE FINDS</span><h2>Your bag <span>({bag.reduce((n, x) => n + x.quantity, 0)})</span></h2></div><button className="icon-button" onClick={() => setBagOpen(false)} aria-label="Close bag"><X /></button></div>
    {!bag.length ? <div className="empty-bag"><span><ShoppingBag /></span><h3>Your bag is taking a little break.</h3><p>Fill it with something lovely.</p><button className="button button-dark" onClick={() => navigate('shop')}>Explore the shop <ArrowRight size={16} /></button></div> : <>
      <div className="drawer-items">{bag.map((item) => <div className="drawer-item" key={item.id}><Image src={item.image} alt={item.name} /><div className="drawer-item-info"><b>{item.name}</b><span>{money(item.sale_price ?? item.price)}</span><div className="quantity-control"><button onClick={() => changeQuantity(item.id, -1)} aria-label="Decrease quantity"><Minus size={13} /></button><span>{item.quantity}</span><button disabled={item.quantity >= Number(item.stock)} onClick={() => changeQuantity(item.id, 1)} aria-label="Increase quantity"><Plus size={13} /></button></div></div><b className="line-total">{money(Number(item.sale_price ?? item.price) * item.quantity)}</b></div>)}</div>
      <div className="drawer-summary"><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Nationwide delivery</span><b>{money(delivery)}</b></div><div className="drawer-total"><span>Total</span><b>{money(subtotal + delivery)}</b></div><small>Cash on delivery · Rs. 300 flat delivery nationwide</small><button className="button button-dark checkout-button" onClick={() => navigate('checkout')}>Continue to checkout <ArrowRight size={16} /></button><button className="continue-shopping" onClick={() => { setBagOpen(false); navigate('shop') }}><ArrowLeft size={14} /> Keep looking around</button></div>
    </>}
  </aside></div>
}

function ProductModal({ product, products, addToBag, buyNow, openProduct }) {
  const [quantity, setQuantity] = useState(1)
  const related = products.filter((p) => p.id !== product.id && p.category_id === product.category_id).slice(0, 3)
  const price = Number(product.sale_price ?? product.price)
  return <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && openProduct(null)}><section className="product-modal"><button className="icon-button modal-close" onClick={() => openProduct(null)} aria-label="Close product details"><X /></button><div className="modal-main"><div className="modal-image-wrap"><Image src={product.image} alt={product.name} /></div><div className="modal-copy"><span className="eyebrow">{product.category || 'ARVIZO FAVOURITE'}</span><h2>{product.name}</h2><div className="modal-rating"><span>★★★★★</span> {Number(product.rating || 4.8).toFixed(1)} <small>({product.review_count || 0} lovely reviews)</small></div><div className="modal-price">{money(price)}{product.sale_price && <><del>{money(product.price)}</del><span className="sale-save">Save {Math.round((1 - price / Number(product.price)) * 100)}%</span></>}</div><p>{product.description || 'A thoughtful everyday find, chosen to bring a little more joy to your daily routine.'}</p><div className={`stock-note ${product.stock > 0 ? '' : 'out'}`}><span></span>{product.stock > 0 ? `${product.stock} in stock · ships nationwide` : 'Currently out of stock'}</div><div className="modal-buy-row"><div className="quantity-control large"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease quantity"><Minus size={14} /></button><span>{quantity}</span><button disabled={quantity >= Number(product.stock)} onClick={() => setQuantity(Math.min(Number(product.stock), quantity + 1))} aria-label="Increase quantity"><Plus size={14} /></button></div><button className="button button-dark" disabled={Number(product.stock) < 1} onClick={() => addToBag(product, quantity)}>Add to bag <ShoppingBag size={16} /></button></div><button className="button button-terracotta buy-now" disabled={Number(product.stock) < 1} onClick={() => buyNow(product)}>Buy now · {money(price * quantity)}</button><div className="modal-details"><span><Truck size={15} /> Rs. 300 delivery, nationwide</span><span><PackageCheck size={15} /> Cash on delivery</span><a href={waLink} target="_blank" rel="noreferrer">Questions? Chat with us <ArrowUpRight size={13} /></a></div></div></div>
    {related.length > 0 && <div className="related-row"><b>You might like these, too</b><div>{related.map((p) => <button key={p.id} onClick={() => { setQuantity(1); openProduct(p) }}><Image src={p.image} alt="" /><span>{p.name}</span><small>{money(p.sale_price ?? p.price)}</small></button>)}</div></div>}
    </section></div>
}

function Checkout({ bag, subtotal, changeQuantity, navigate, onOrder, toast }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', city: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!bag.length) return <main className="checkout-wrap"><div className="empty-state"><span className="empty-icon"><ShoppingBag /></span><h2>Your bag is empty</h2><p>Once you find something lovely, it will be waiting here.</p><button className="button button-dark" onClick={() => navigate('shop')}>Back to shopping</button></div></main>
  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const data = await api('orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, items: bag.map((item) => ({ product_id: Number(item.id), quantity: item.quantity })) }) })
      onOrder(data.order)
    } catch (err) { setError(err.message); toast(err.message); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    finally { setBusy(false) }
  }
  return <main className="checkout-wrap"><button className="back-link" onClick={() => history.back()}><ArrowLeft size={15} /> Back to shopping</button><div className="checkout-heading"><span className="eyebrow">JUST A FEW DETAILS</span><h1>Let's get this to <em>you.</em></h1><p>No account, no fuss. Just your delivery details.</p></div>
    <div className="checkout-layout"><form className="checkout-form" onSubmit={submit}><div className="form-card"><div className="form-section-title"><span>01</span><div><h2>Who are we delivering to?</h2><p>We only use these details to get your order to you.</p></div></div>{error && <div className="form-error">{error}</div>}<div className="form-grid"><label className="field full"><span>Full name <i>*</i></span><input required maxLength="160" autoComplete="name" value={form.name} onChange={update('name')} placeholder="As your parcel should say" /></label><label className="field"><span>Pakistani mobile number <i>*</i></span><input required type="tel" autoComplete="tel" value={form.phone} onChange={update('phone')} placeholder="03XX XXXXXXX" /><small>We'll share delivery updates here.</small></label><label className="field"><span>Email address <small>optional</small></span><input type="email" maxLength="190" autoComplete="email" value={form.email} onChange={update('email')} placeholder="you@example.com" /></label><label className="field full"><span>Delivery address <i>*</i></span><textarea required maxLength="600" autoComplete="street-address" value={form.address} onChange={update('address')} placeholder="House, street, area, and anything that helps us find you" rows="3" /></label><label className="field"><span>City <i>*</i></span><input required maxLength="100" autoComplete="address-level2" value={form.city} onChange={update('city')} placeholder="e.g. Lahore" /></label><label className="field full"><span>Order notes <small>optional</small></span><textarea maxLength="1000" value={form.notes} onChange={update('notes')} placeholder="Delivery instructions, a gift note, anything else..." rows="2" /></label></div></div>
      <div className="form-card payment-card"><div className="form-section-title"><span>02</span><div><h2>How would you like to pay?</h2><p>Easy does it. Pay when your order arrives.</p></div></div><div className="payment-choice"><span className="radio-visual"></span><div><b>Cash on delivery</b><small>Pay in cash to your delivery partner.</small></div><span className="cod-badge">COD</span></div></div>
      <button className="button button-dark place-order" type="submit" disabled={busy}>{busy ? 'Placing your order...' : 'Place my order'} {!busy && <ArrowRight size={17} />}</button><p className="secure-note"><LockKeyhole size={14} /> Your details are only used to fulfil this order.</p>
    </form>
      <aside className="order-summary"><span className="eyebrow">YOUR LITTLE FINDS</span><h2>Order summary</h2><div className="summary-products">{bag.map((item) => <div className="summary-product" key={item.id}><Image src={item.image} alt="" /><div><b>{item.name}</b><small>{money(item.sale_price ?? item.price)}</small><div className="quantity-control"><button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label="Decrease quantity"><Minus size={12} /></button><span>{item.quantity}</span><button type="button" disabled={item.quantity >= Number(item.stock)} onClick={() => changeQuantity(item.id, 1)} aria-label="Increase quantity"><Plus size={12} /></button></div></div><b>{money(Number(item.sale_price ?? item.price) * item.quantity)}</b></div>)}</div><div className="summary-math"><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Nationwide delivery</span><b>{money(300)}</b></div><div className="summary-grand"><span>Total</span><b>{money(subtotal + 300)}</b></div></div><div className="summary-cod"><PackageCheck size={16} /> Cash on delivery · Rs. 300 flat</div></aside>
    </div></main>
}

function Confirmation({ order, goHome, trackOrder }) {
  const orderMessage = `New Arvizo order ${order.order_number}\nName: ${order.name}\nPhone: ${order.phone}\nAddress: ${order.address}, ${order.city}\nItems: ${order.items?.map((item) => `${item.name} x ${item.quantity} (${money(item.unit_price * item.quantity)})`).join(', ')}\nTotal: ${money(order.total)} · Cash on delivery`
  const orderWhatsApp = `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(orderMessage)}`
  return <main className="confirmation-wrap"><div className="confirmation-card"><span className="confirmation-check"><Check /></span><span className="eyebrow">ORDER CONFIRMED</span><h1>Thanks, {order.name}. <em>You're all set.</em></h1><p>Your order is saved. We will contact you to confirm delivery details.</p><div className="confirmation-items">{order.items?.map((item, i) => <div key={`${item.name}-${i}`}><Image src={item.image} alt="" /><span>{item.name}<small>Qty {item.quantity}</small></span><b>{money(item.unit_price * item.quantity)}</b></div>)}</div><div className="confirmation-totals"><div><span>Subtotal</span><b>{money(order.subtotal)}</b></div><div><span>Nationwide delivery</span><b>{money(order.delivery_fee)}</b></div><div className="summary-grand"><span>Total · Cash on delivery</span><b>{money(order.total)}</b></div></div><div className="delivery-estimate"><Truck size={18} /><span><b>Delivery estimate: 3–7 business days</b><small>{order.email_notified ? 'Order details emailed to Arvizo.' : 'Order saved. Email notification is not configured on the server yet.'}</small></span></div><div className="confirmation-help"><b>Send order details to Arvizo</b><a href={orderWhatsApp} target="_blank" rel="noreferrer">Send on WhatsApp <ArrowUpRight size={13} /></a><a href={`mailto:${STORE_EMAIL}?subject=${encodeURIComponent(`Arvizo order ${order.order_number}`)}&body=${encodeURIComponent(orderMessage)}`}>Email order details <ArrowUpRight size={13} /></a></div><div className="confirmation-actions"><button className="button button-dark" onClick={trackOrder}>Our Orders <ArrowRight size={15} /></button><button className="button button-outline" onClick={goHome}>Back to Arvizo</button></div></div></main>
}

function SupportPage() {
  return <main className="support-page page-wrap"><div className="support-hero"><span className="eyebrow">A REAL PERSON, RIGHT HERE</span><h1>Need a little <em>help?</em></h1><p>Order question, product detail, or just a quick hello — we'd love to hear from you.</p></div><div className="support-options"><a href={`tel:${SUPPORT_PHONE}`} className="support-card"><span className="support-icon"><span className="phone-icon">☎</span></span><span className="eyebrow">GIVE US A RING</span><h2>Call Arvizo</h2><p>Talk it through with our customer care team.</p><b>0336 8915598 <ArrowUpRight size={15} /></b></a><a href={waLink} target="_blank" rel="noreferrer" className="support-card"><span className="support-icon whatsapp-icon">◉</span><span className="eyebrow">QUICK QUESTION?</span><h2>WhatsApp us</h2><p>A little note is all it takes. We're happy to help.</p><b>Start a conversation <ArrowUpRight size={15} /></b></a><a href="mailto:arvizostore@gmail.com" className="support-card"><span className="support-icon"><span className="phone-icon">@</span></span><span className="eyebrow">SEND US A NOTE</span><h2>Email Arvizo</h2><p>We can help with your order or product questions.</p><b>arvizostore@gmail.com <ArrowUpRight size={15} /></b></a></div><div className="support-bottom"><PackageCheck size={20} /><div><b>Already placed an order?</b><p>Have your order number handy and we'll help with everything from delivery updates to returns.</p></div></div></main>
}

function StoryPage({ navigate }) {
  return <main className="story-page"><div className="story-hero"><Image src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1800&q=90" alt="Arvizo wristwatch collection" /><div><span className="eyebrow">ARVIZO WATCHES & AUDIO</span><h1>Made for every<br /><em>moment.</em></h1></div></div><section className="story-copy"><span className="eyebrow">THE ARVIZO WAY</span><h2>Great style. Better sound.</h2><p>Arvizo brings together watches that finish your look and earbuds that make every playlist, call, and commute sound better.</p><p>We believe shopping for everyday essentials should feel easy. Explore the collection, choose your favourite, and have it delivered to your doorstep anywhere in Pakistan.</p><button className="button button-dark" onClick={() => navigate('shop')}>Shop the collection <ArrowRight size={15} /></button></section></main>
}

function Footer({ navigate }) {
  return <footer className="site-footer"><div className="footer-top"><div className="footer-brand"><a href="/" className="wordmark" aria-label="Arvizo home" onClick={(e) => { e.preventDefault(); navigate('home') }}><BrandLogo /></a><p>Watches and wireless audio for your everyday. Delivered nationwide.</p><a href={waLink} target="_blank" rel="noreferrer" className="footer-wa">Say hello on WhatsApp <ArrowUpRight size={14} /></a></div><div className="footer-column"><b>Take a look</b><button onClick={() => navigate('shop')}>Shop everything</button><button onClick={() => { navigate('home'); setTimeout(() => document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' }), 80) }}>Categories</button><button onClick={() => navigate('story')}>Our story</button></div><div className="footer-column"><b>Here to help</b><button onClick={() => navigate('contact')}>Order help</button><button onClick={() => navigate('contact')}>Contact us</button><a href={`tel:${SUPPORT_PHONE}`}>Call 0336 8915598</a><span>Cash on delivery available</span></div><div className="footer-social"><span className="eyebrow">STORE OWNER</span><a href="/admin">Open admin <ArrowUpRight size={15} /></a><a href={`mailto:${STORE_EMAIL}`}>Email Arvizo <ArrowUpRight size={15} /></a><a href={waLink} target="_blank" rel="noreferrer">WhatsApp <ArrowUpRight size={15} /></a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Arvizo. Made for everyday.</span><span>Thoughtfully delivered across Pakistan <span className="footer-heart">♥</span></span></div></footer>
}

function Admin({ onBack, toast }) {
  const [authorized, setAuthorized] = useState(null)
  const [email, setEmail] = useState(STORE_EMAIL)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('dashboard')
  const [stats, setStats] = useState({})
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [query, setQuery] = useState('')
  const [month, setMonth] = useState(karachiMonth)
  const [report, setReport] = useState(null)
  const [editor, setEditor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refreshingOrders, setRefreshingOrders] = useState(false)

  const load = async (currentTab = tab) => {
    try {
      if (currentTab === 'dashboard') setStats((await api('admin/dashboard')).stats)
      if (currentTab === 'orders') setOrders((await api(`admin/orders?q=${encodeURIComponent(query)}`)).orders)
      if (currentTab === 'reports') setReport(await api(`admin/reports?month=${month}`))
      if (currentTab === 'products') setProducts((await api('admin/products')).products)
      if (currentTab === 'categories') setCategories((await api('admin/categories')).categories)
    } catch (err) { if (err.message.includes('sign in') || err.message.includes('expired')) setAuthorized(false); else setError(err.message) }
  }
  useEffect(() => { api('admin/me').then(() => setAuthorized(true)).catch(() => setAuthorized(false)) }, [])
  useEffect(() => { if (authorized) load(tab) }, [authorized, tab])
  useEffect(() => { if (authorized && tab === 'orders') { const t = setTimeout(() => load('orders'), 220); return () => clearTimeout(t) } }, [query])
  useEffect(() => { if (authorized && tab === 'reports') load('reports') }, [month])

  const login = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); setAuthorized(true) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const refreshOrders = async () => {
    setRefreshingOrders(true)
    setError('')
    try {
      const result = await api(`admin/orders?q=${encodeURIComponent(query)}`)
      setOrders(result.orders)
      toast('Orders refreshed')
    } catch (err) {
      if (err.message.includes('sign in') || err.message.includes('expired')) setAuthorized(false)
      else setError(err.message)
    } finally {
      setRefreshingOrders(false)
    }
  }
  const logout = async () => { try { await api('admin/logout', { method: 'POST' }) } finally { setAuthorized(false); setPassword('') } }
  const changeStatus = async (order, status) => {
    try { await api(`admin/orders/${order.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); await load('orders'); toast(`Order ${order.order_number} updated`) }
    catch (err) { toast(err.message) }
  }
  const deleteOrder = async (order) => {
    if (!window.confirm(`Delete order ${order.order_number}? This cannot be undone.`)) return
    try { await api(`admin/orders/${order.id}`, { method: 'DELETE' }); await load(tab); toast('Order deleted') } catch (err) { toast(err.message) }
  }
  const saveRecord = async (type, record) => {
    const path = `admin/${type}${record.id ? `/${record.id}` : ''}`
    try {
      await api(path, { method: record.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) })
      setEditor(null); await load(type); toast(`${type === 'products' ? 'Product' : 'Category'} saved`)
    } catch (err) { throw err }
  }
  const deleteRecord = async (type, record) => {
    if (!window.confirm(`Delete “${record.name}”?${type === 'categories' ? ' Products will be left uncategorized.' : ''}`)) return
    try { await api(`admin/${type}/${record.id}`, { method: 'DELETE' }); await load(type); toast('Deleted successfully') } catch (err) { toast(err.message) }
  }
  if (authorized === null) return <div className="admin-loading"><BrandLogo /><p>Just a moment...</p></div>
  if (!authorized) return <div className="admin-login-shell"><button className="admin-back" onClick={onBack}><ArrowLeft size={16} /> Back to Arvizo</button><form className="admin-login" onSubmit={login}><BrandLogo className="admin-login-logo" /><span className="eyebrow">ARVIZO STORE OWNER</span><h1>Welcome back.</h1><p>Your little corner of the shop, all in one place.</p>{error && <div className="form-error">{error}</div>}<label className="field"><span>Email address</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label><label className="field"><span>Password</span><input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label><button className="button button-dark admin-login-button" disabled={busy}>{busy ? 'Signing in...' : 'Sign in securely'} <ArrowRight size={16} /></button><small className="login-note"><ShieldCheck size={14} /> Owner access only. Customer checkout never needs an account.</small></form></div>

  const tabs = [['dashboard','Overview'],['orders','Orders'],['reports','Monthly reports'],['products','Products'],['categories','Categories']]
  return <div className="admin-shell"><aside className="admin-sidebar"><a href="/" className="wordmark admin-brand" aria-label="Arvizo storefront" onClick={(e) => { e.preventDefault(); onBack() }}><BrandLogo /></a><div className="admin-nav">{tabs.map(([key,label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div><button className="admin-store-link" onClick={onBack}><ArrowLeft size={15} /> Back to storefront</button></aside><main className="admin-main"><header className="admin-topbar"><div className="admin-mobile-brand"><button className="icon-button" onClick={onBack} aria-label="Back to store"><ArrowLeft /></button><BrandLogo /></div><span className="owner-badge"><span></span> Owner session</span><button className="admin-logout" onClick={logout}>Sign out <ArrowUpRight size={14} /></button></header><div className="admin-content">
    {tab === 'dashboard' && <><div className="admin-page-heading"><div><span className="eyebrow">YOUR SHOP, AT A GLANCE</span><h1>Good morning.</h1><p>Here's how things are looking this month.</p></div><span className="admin-date">{new Intl.DateTimeFormat('en-PK', { month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' }).format(new Date())}</span></div><div className="stats-grid">{[['Orders this month',stats.orders ?? 0,'↗'],['Sales this month',money(stats.sales),'Rs'],['Pending orders',stats.pending ?? 0,'…'],['Delivered orders',stats.delivered ?? 0,'✓'],['Cancelled orders',stats.cancelled ?? 0,'×']].map(([label,value,mark]) => <div className="stat-card" key={label}><span>{label}</span><b>{value}</b><small>{mark === '↗' ? 'Every order, all in one place' : mark === 'Rs' ? 'Excludes cancelled orders' : 'This month'}</small></div>)}</div><div className="admin-welcome"><div><span className="eyebrow">THE LITTLE THINGS ADD UP</span><h2>You're doing lovely things.</h2><p>Keep an eye on new orders and help every Arvizo parcel find its way home.</p></div><button className="button button-dark" onClick={() => setTab('orders')}>See your orders <ArrowRight size={15} /></button></div></>}
    {tab === 'orders' && <><div className="admin-page-heading"><div><span className="eyebrow">CUSTOMER ORDERS</span><h1>Orders</h1><p>Every order, from just placed to delivered.</p></div><button className="button button-outline" onClick={refreshOrders} disabled={refreshingOrders}><RefreshCw size={15} /> {refreshingOrders ? 'Refreshing...' : 'Refresh orders'}</button></div>{error && <div className="form-error" role="alert">{error}</div>}<label className="admin-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order number or mobile number" /></label><div className="admin-orders">{orders.map((order) => <article className="admin-order" key={order.id}><div className="admin-order-head"><div><span className="order-code">{order.order_number}</span><span className="admin-order-date">{order.created_at}</span></div><div className="order-management"><select aria-label={`Status for ${order.order_number}`} value={order.status} onChange={(e) => changeStatus(order,e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select><button className="delete-text" onClick={() => deleteOrder(order)}>Delete</button></div></div><div className="order-customer"><b>{order.customer_name}</b><a href={`tel:${order.phone}`}>{order.phone}</a>{order.email && <a href={`mailto:${order.email}`}>{order.email}</a>}<span>{order.address}, {order.city}</span>{order.notes && <p>Note: {order.notes}</p>}</div><div className="order-detail-items">{order.items?.map((item,i) => <span key={i}><Image src={item.image} alt="" />{item.product_name} × {item.quantity} <b>{money(item.unit_price * item.quantity)}</b></span>)}</div><div className="admin-order-totals"><span>{order.payment_method}</span><span>Delivery {money(order.delivery_fee)}</span><b>Total {money(order.total)}</b></div></article>)}{!orders.length && <div className="admin-empty">No orders found. New orders will appear here.</div>}</div></>}
    {tab === 'reports' && <><div className="admin-page-heading"><div><span className="eyebrow">A LITTLE MONTHLY RECAP</span><h1>Monthly reports</h1><p>Orders, sales, and the details behind them.</p></div><label className="month-picker"><span>Choose month</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label></div>{report && <><div className="report-stats"><div><span>Orders</span><b>{report.summary.count}</b></div><div><span>Sales · excluding cancelled</span><b>{money(report.summary.sales)}</b></div><div><span>Cancelled</span><b>{report.summary.cancelled}</b></div></div><div className="report-list">{report.orders.map((order) => <article key={order.id} className="report-order"><div><b>{order.order_number}</b><span>{order.customer_name} · {order.phone} · {order.city}</span><small>{order.created_at} · {order.status}</small></div><b>{money(order.total)}</b><p>{order.items.map((item) => `${item.product_name} × ${item.quantity}`).join(' · ') || 'No item details'}</p></article>)}{!report.orders.length && <div className="admin-empty">No orders for this month yet.</div>}</div></>}</>}
    {tab === 'products' && <><div className="admin-page-heading"><div><span className="eyebrow">YOUR THOUGHTFUL FINDS</span><h1>Products</h1><p>Add, update, or make a product visible in the shop.</p></div><button className="button button-dark" onClick={() => setEditor({ type:'products', record: blankProduct() })}><Plus size={16} /> Add product</button></div><div className="admin-record-list">{products.map((p) => <article className="admin-record" key={p.id}><Image src={p.image} alt="" /><div className="admin-record-info"><b>{p.name}</b><span>{p.category || 'Uncategorized'} · {money(p.sale_price ?? p.price)}</span><small>Stock {p.stock} · {p.status}</small></div><button className="button button-outline admin-edit" onClick={() => setEditor({ type:'products', record:{...p, sale_price:p.sale_price ?? '', category_id:p.category_id ?? ''} })}>Edit</button><button className="delete-text" onClick={() => deleteRecord('products',p)}>Delete</button></article>)}</div></>}
    {tab === 'categories' && <><div className="admin-page-heading"><div><span className="eyebrow">THE SHOP, SORTED</span><h1>Categories</h1><p>Keep your shop easy to browse.</p></div><button className="button button-dark" onClick={() => setEditor({ type:'categories', record:blankCategory() })}><Plus size={16} /> Add category</button></div><div className="admin-record-list">{categories.map((c) => <article className="admin-record" key={c.id}><Image src={c.image} alt="" /><div className="admin-record-info"><b>{c.name}</b><span>{c.slug}</span><small>{c.product_count} products use this category</small></div><button className="button button-outline admin-edit" onClick={() => setEditor({ type:'categories', record:{...c} })}>Edit</button><button className="delete-text" onClick={() => deleteRecord('categories',c)}>Delete</button></article>)}</div></>}
  </div></main>{editor && <AdminEditor type={editor.type} record={editor.record} categories={categories} save={saveRecord} close={() => setEditor(null)} />}</div>
}

function blankProduct() { return { name:'',slug:'',description:'',price:'',sale_price:'',stock:0,category_id:'',image:'',status:'active' } }
function blankCategory() { return { name:'',slug:'',image:'' } }

function AdminEditor({ type, record, categories, save, close }) {
  const [form, setForm] = useState(record)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [savedImages, setSavedImages] = useState([])
  useEffect(() => { api('admin/images').then((data) => setSavedImages(data.images || [])).catch((err) => setError(err.message)) }, [])
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const upload = async (file) => {
    if (!file) return
    setUploading(true); setError('')
    const formData = new FormData(); formData.append('image', file)
    try { const result = await api('admin/upload', { method:'POST', body:formData }); update('image',result.image); setSavedImages((imgs) => [...new Set([...imgs,result.image])]) }
    catch (err) { setError(err.message) } finally { setUploading(false) }
  }
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try { await save(type,{...form, price:Number(form.price), sale_price:form.sale_price === '' ? null : Number(form.sale_price), stock:Number(form.stock), category_id:form.category_id || null }) }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="overlay admin-editor-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}><form className="admin-editor" onSubmit={submit}><div className="editor-heading"><div><span className="eyebrow">{record.id ? 'MAKE A LITTLE UPDATE' : 'ADD SOMETHING LOVELY'}</span><h2>{record.id ? 'Edit' : 'Add'} {type === 'products' ? 'product' : 'category'}</h2></div><button type="button" className="icon-button" onClick={close} aria-label="Close editor"><X /></button></div>{error && <div className="form-error">{error}</div>}
    <label className="field"><span>Name <i>*</i></span><input required maxLength="180" value={form.name || ''} onChange={(e) => { update('name',e.target.value); if (!record.id) update('slug',slugify(e.target.value)) }} /></label><label className="field"><span>Slug <i>*</i></span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug || ''} onChange={(e) => update('slug',e.target.value)} /></label>
    {type === 'products' ? <><label className="field"><span>Description</span><textarea rows="3" maxLength="5000" value={form.description || ''} onChange={(e) => update('description',e.target.value)} /></label><div className="editor-fields-two"><label className="field"><span>Regular price (Rs.) <i>*</i></span><input type="number" min="1" step="1" required value={form.price ?? ''} onChange={(e) => update('price',e.target.value)} /></label><label className="field"><span>Sale price (Rs.)</span><input type="number" min="1" step="1" value={form.sale_price ?? ''} onChange={(e) => update('sale_price',e.target.value)} /></label><label className="field"><span>Stock <i>*</i></span><input type="number" min="0" step="1" required value={form.stock ?? 0} onChange={(e) => update('stock',e.target.value)} /></label><label className="field"><span>Category</span><select value={form.category_id || ''} onChange={(e) => update('category_id',e.target.value)}><option value="">Uncategorized</option>{categories.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label className="field full"><span>Visibility</span><select value={form.status} onChange={(e) => update('status',e.target.value)}><option value="active">Active</option><option value="draft">Draft</option><option value="out-of-stock">Out of stock</option></select></label></div></> : null}
    <label className="field"><span>Image URL or uploaded image path</span><input value={form.image || ''} onChange={(e) => update('image',e.target.value)} placeholder="https://... or select an upload below" /></label><label className="upload-control"><span>{uploading ? 'Uploading...' : 'Upload JPEG, PNG, or WebP · up to 5 MB'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} /></label>
    {savedImages.length > 0 && <div className="saved-images"><span>Previously uploaded images · choose one</span>{savedImages.map((src) => <button type="button" key={src} className={form.image === src ? 'selected' : ''} onClick={() => update('image',src)}><Image src={src} alt="Choose uploaded image" /></button>)}</div>}
    {form.image && <div className="image-preview"><span>Image preview</span><Image src={form.image} alt="Preview" /></div>}
    <div className="editor-actions"><button type="button" className="button button-outline" onClick={close}>Cancel</button><button className="button button-dark" disabled={busy || uploading}>{busy ? 'Saving...' : 'Save changes'} <Check size={15} /></button></div></form></div>
}

export default App
