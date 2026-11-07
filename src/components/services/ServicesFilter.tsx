// components/services/ServicesFilter.tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Filter } from 'lucide-react'

export default function ServicesFilter({ categories, minimumRating }: { categories: string[]; minimumRating?: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [filters, setFilters] = useState({
    category: searchParams.get('category') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minRating: minimumRating?.toString() ?? '',
    search: searchParams.get('search') || searchParams.get('q') || ''
  })
  
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    
    router.push(params.size ? `/services?${params.toString()}` : '/services')
  }
  
  const clearFilters = () => {
    setFilters({
      category: '',
      minPrice: '',
      maxPrice: '',
      minRating: '',
      search: ''
    })
    router.push('/services')
  }
  
  const hasActiveFilters = Object.values(filters).some(v => v !== '')
  
  return (
    <form onSubmit={applyFilters} className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Filters
        </h3>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-purple-600 hover:text-purple-700"
          >
            Clear all
          </button>
        )}
      </div>
      
      {/* Search */}
      <div className="mb-6">
        <label htmlFor="service-search" className="block text-sm font-medium text-gray-700 mb-2">
          Search
        </label>
        <input
          id="service-search"
          type="text"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder="Search services..."
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
        />
      </div>
      
      {/* Category */}
      <div className="mb-6">
        <label htmlFor="service-category" className="block text-sm font-medium text-gray-700 mb-2">
          Category
        </label>
        <select
          id="service-category"
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
        >
          <option value="">All Categories</option>
          {filters.category && !categories.includes(filters.category) && <option value={filters.category}>{filters.category} (unavailable)</option>}
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>
      
      {/* Price Range */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Price Range (₹)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            aria-label="Minimum price (₹)"
            min="0"
            value={filters.minPrice}
            onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
            placeholder="Min"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
          />
          <span className="self-center">-</span>
          <input
            type="number"
            aria-label="Maximum price (₹)"
            min="0"
            value={filters.maxPrice}
            onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
            placeholder="Max"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
          />
        </div>
      </div>

      <div className="mb-6">
        <label htmlFor="service-rating" className="block text-sm font-medium text-gray-700 mb-2">
          Minimum rating (out of 5)
        </label>
        <input
          id="service-rating"
          type="number"
          min="1"
          max="5"
          step="0.1"
          value={filters.minRating}
          onChange={(event) => setFilters({ ...filters, minRating: event.target.value })}
          placeholder="Any rating"
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
        />
      </div>
      
      {/* Apply Button */}
      <button
        type="submit"
        className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors"
      >
        Apply Filters
      </button>
    </form>
  )
}
