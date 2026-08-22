'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Activity, CheckCircle, AlertTriangle, Heart, TrendingUp, Clock, Users } from 'lucide-react'
import { logger } from '@/lib/logger'
import { isDemoEnabled } from '@/lib/demo-mode'

interface FeedItem {
  id: string
  type: 'medication_taken' | 'medication_missed' | 'streak' | 'health_score' | 'alert' | 'insight'
  memberName: string
  memberColor: string
  message: string
  timestamp: string
  data?: Record<string, unknown>
}

export function FamilyHealthFeed() {
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFeed = async () => {
    const isDemoMode = isDemoEnabled();

    // Demo mode: return seeded data without backend call
    if (isDemoMode) {
      const demoFeed: FeedItem[] = [
        {
          id: 'feed1',
          type: 'medication_taken',
          memberName: 'Robert Wilson',
          memberColor: '#10b981',
          message: 'Took Metformin 500mg after breakfast',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'feed2',
          type: 'medication_taken',
          memberName: 'Emma Wilson',
          memberColor: '#0d9488',
          message: 'Took Thyroxine 50mcg on empty stomach',
          timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
        },
        {
          id: 'feed3',
          type: 'streak',
          memberName: 'Noah Wilson',
          memberColor: '#0891b2',
          message: '7-day medication streak achieved!',
          timestamp: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
        },
      ]
      setFeed(demoFeed)
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/family-feed')
      if (res.ok) {
        const data = await res.json()
        setFeed(data.feed || [])
      }
    } catch (error) {
      logger.warn('Failed to fetch feed:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFeed()
    // Poll for new feed items every 30 seconds
    const interval = setInterval(fetchFeed, 30000)
    return () => clearInterval(interval)
  }, [fetchFeed])

  const getIcon = (type: FeedItem['type']) => {
    switch (type) {
      case 'medication_taken': return CheckCircle
      case 'medication_missed': return AlertTriangle
      case 'streak': return TrendingUp
      case 'health_score': return Activity
      case 'alert': return AlertTriangle
      case 'insight': return Heart
      default: return Activity
    }
  }

  const getIconColor = (type: FeedItem['type']) => {
    switch (type) {
      case 'medication_taken': return 'text-green-500'
      case 'medication_missed': return 'text-red-500'
      case 'streak': return 'text-orange-500'
      case 'health_score': return 'text-blue-500'
      case 'alert': return 'text-red-500'
      case 'insight': return 'text-purple-500'
      default: return 'text-gray-500'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US')
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/3" />
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Family Health Feed
        </CardTitle>
      </CardHeader>
      <CardContent>
        {feed.length > 0 ? (
          <div className="space-y-4">
            {feed.map((item) => {
              const Icon = getIcon(item.type)
              const iconColor = getIconColor(item.type)

              return (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                    style={{ backgroundColor: item.memberColor || '#10b981' }}
                  >
                    {item.memberName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.memberName}</span>
                      <Icon className={`h-4 w-4 ${iconColor}`} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {formatTime(item.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No activity yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Health activity from your family will appear here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
