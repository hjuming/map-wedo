'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, MapPin, Compass, Anchor, Leaf, Utensils, Plane } from 'lucide-react'

// --- Types ---
type Place = {
  id: string
  name: string
  category: 'food' | 'dive' | 'pet' | 'travel'
  subcategory?: string
  location: any
  metadata: any
  google_url?: string
  rating?: number
  address?: string // Added
  // Client-side fields
  distance?: number // in km
}

// --- Categories ---
// Order: Travel, Dive, Pet, Food (User Request: 排序是Travel、Dive、Pets, but Food is default. 
// I will show tabs in that order, but make Food default active)
const CATEGORIES = [
  { id: 'food', label: '美食 Food', icon: Utensils },
  { id: 'travel', label: '旅遊 Travel', icon: Plane },
  { id: 'dive', label: '潛水 Diving', icon: Anchor },
  { id: 'pet', label: '寵物 Pets', icon: Leaf },
]

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('food') // Default: Food
  const [activeTag, setActiveTag] = useState('')
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 30

  // 1. Get User Location on Mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          })
        },
        (err) => console.error('Geo Error:', err),
        { enableHighAccuracy: true }
      )
    }
    fetchPlaces()
  }, [])

  // 2. Fetch All Places (Supabase)
  async function fetchPlaces() {
    setLoading(true)
    const { data, error } = await supabase
      .from('places')
      .select('*')
    // No limit for now, we do client processing for distance sort. 
    // If dataset > 2000, we need server-side PostGIS query.
    // For ~1000 items, client sort is instant.

    if (error) {
      console.error('Error:', error)
    } else {
      setPlaces(data || [])
    }
    setLoading(false)
  }

  // 3. Helper: Haversine Distance Calculation (km)
  function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d;
  }

  function deg2rad(deg: number) {
    return deg * (Math.PI / 180)
  }

  // 4. Helper: Parse PostGIS Point string "POINT(120.1 23.5)"
  // Or handle Supabase return format
  function parseLocation(loc: any): { lat: number, lng: number } | null {
    if (!loc) return null
    if (typeof loc === 'string' && loc.startsWith('POINT')) {
      // POINT(120.334 22.56) -> lon lat
      const match = loc.match(/\(([^ ]+) ([^ ]+)\)/)
      if (match) {
        return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) }
      }
    }
    return null
  }

  // 5. Compute & Filter & Sort
  const processedPlaces = useMemo(() => {
    let result = places.map(p => {
      // Calculate distance if user location exists
      const pLoc = parseLocation(p.location)
      let dist = undefined
      if (userLocation && pLoc) {
        dist = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, pLoc.lat, pLoc.lng)
      }
      return { ...p, distance: dist }
    })

    // Filter by Category
    if (activeCategory !== 'all') {
      result = result.filter(p => p.category === activeCategory)
    }

    // Filter by Search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.metadata?.tags?.some((t: any) => t.toLowerCase().includes(lower))
      )
    }

    // Filter by Active Tag (Sub-filter)
    if (activeTag) {
      result = result.filter(p => p.metadata?.tags?.includes(activeTag))
    }

    // Sort
    // Priority 1: Distance (if available) -> Nearest first
    // Priority 2: Name
    result.sort((a, b) => {
      if (typeof a.distance === 'number' && typeof b.distance === 'number') {
        return a.distance - b.distance
      }
      return 0 // Keep original order if no geo
    })

    return result
  }, [places, activeCategory, searchTerm, activeTag, userLocation])

  // Pagination Slice
  const visiblePlaces = processedPlaces.slice(0, page * PAGE_SIZE)

  // 6. Extract Unique Tags for Sub-filter
  const availableTags = useMemo(() => {
    const allTags = new Set<string>()
    // Only extract tags from the *current* category filtered list (ignoring search text for now to show context)
    const categoryPlaces = places.filter(p => p.category === activeCategory)
    categoryPlaces.forEach(p => {
      p.metadata?.tags?.forEach((t: string) => allTags.add(t))
    })
    return Array.from(allTags).slice(0, 15) // Limit to top 15 to avoid clutter
  }, [places, activeCategory])

  // Helper: Clean Address & HTML
  const cleanAddress = (meta: any) => {
    // Priority: address column -> metadata.address -> metadata.original_description (cleaned)
    // Actually our schema has 'address' column.

    // If original_description contains address-like info, use it.
    // Screenshot shows: "302新竹縣... <br> +886..."
    // We want to remove HTML.

    let raw = meta?.original_description || ""
    // Remove HTML tags
    let clean = raw.replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/g, ' ')
    // Extract phone? maybe later.
    return clean.substring(0, 80) + (clean.length > 80 ? '...' : '')
  }

  const getMapLink = (place: Place) => {
    if (place.google_url) return place.google_url
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`
  }

  const [searchExpanded, setSearchExpanded] = useState(false) // New State

  // ... (inside component) ...

  return (
    <main>
      {/* Header */}
      <nav className="navbar">
        <div className="nav-container">
          {/* 1. Brand */}
          <a href="/" className="brand">
            <Compass size={24} className="text-sky-400" />
            <span>Map WEDO</span>
          </a>

          {/* 2. Categories (Middle) */}
          <div className="header-categories">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`cat-tab ${activeCategory === cat.id ? `active-${cat.id}` : ''}`}
                onClick={() => {
                  setActiveCategory(cat.id)
                  setActiveTag('')
                  setPage(1)
                }}
              >
                <cat.icon size={16} />
                {cat.label}
              </button>
            ))}
          </div>

          {/* 3. Search (Right, Expandable) */}
          <div className="header-search">
            <div className="search-wrapper">
              <button
                className="search-icon-btn"
                onClick={() => {
                  setSearchExpanded(!searchExpanded)
                  if (!searchExpanded) document.getElementById('search-input')?.focus()
                }}
              >
                <Search size={20} />
              </button>

              <input
                id="search-input"
                type="text"
                placeholder="搜尋地點..."
                className={`search-input ${searchExpanded || searchTerm ? 'expanded' : ''}`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onBlur={() => !searchTerm && setSearchExpanded(false)}
              />
            </div>
          </div>
        </div>
      </nav>

      {/* Sub-Filters (Tags) */}
      {availableTags.length > 0 && (
        <div className="sub-filters">
          <button
            className={`filter-chip ${activeTag === '' ? 'active' : ''}`}
            onClick={() => setActiveTag('')}
          >
            全部 All
          </button>
          {availableTags.map(tag => (
            <button
              key={tag}
              className={`filter-chip ${activeTag === tag ? 'active' : ''}`}
              onClick={() => setActiveTag(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Main Grid */}
      <div className="main-container">

        {loading ? (
          <div className="text-center py-20 text-slate-500">載入中 Loading...</div>
        ) : (
          <>
            <div className="places-grid">
              {visiblePlaces.map(place => (
                <a
                  key={place.id}
                  href={getMapLink(place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`place-card item-${place.category}`}
                >
                  <div className="card-content">
                    <div className="card-header">
                      <h3 className="place-name">{place.name}</h3>
                      {place.distance && (
                        <span className="text-xs font-mono text-emerald-400 whitespace-nowrap ml-2">
                          {place.distance.toFixed(1)} km
                        </span>
                      )}
                    </div>

                    {/* Address with Icon */}
                    {(place.address || (place.metadata?.original_description && place.category === 'pet')) && (
                      <div className="place-address">
                        <MapPin size={14} className="mt-1 shrink-0 opacity-70" />
                        <span>{place.address || cleanAddress(place.metadata)}</span>
                      </div>
                    )}

                    {/* Description Paragraph (Cleaned) */}
                    {place.metadata?.description && place.metadata.description.length > 2 && (
                      <p className="text-sm text-slate-400 leading-relaxed line-clamp-3 mt-2">
                        {place.metadata.description}
                      </p>
                    )}

                    <div className="place-tags">
                      {/* Show category as first tag */}
                      <span className="place-type">{place.category}</span>
                      {place.metadata?.tags?.slice(0, 3).map((tag: string, i: number) => (
                        <span key={i} className="tag-dot">#{tag}</span>
                      ))}
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* Pagination Load More */}
            {visiblePlaces.length < processedPlaces.length && (
              <button
                className="load-more-btn"
                onClick={() => setPage(p => p + 1)}
              >
                載入更多 ({processedPlaces.length - visiblePlaces.length})
              </button>
            )}

            {visiblePlaces.length === 0 && (
              <div className="text-center py-20 text-slate-500">
                <h3 className="text-xl font-medium mb-2">沒有找到相關地點</h3>
                <p>試試看搜尋其他關鍵字或切換分類</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-content">
          <span>&copy; {new Date().getFullYear()} Map WEDO. All rights reserved.</span>
          <a href="https://map.wedopr.com" className="footer-link">map.wedopr.com</a>
        </div>
      </footer>
    </main>
  )
}
