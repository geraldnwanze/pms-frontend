'use client';

import { Construction } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/ui';

export function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={description} />
      <div className="card">
        <EmptyState
          icon={<Construction className="h-6 w-6" />}
          title={`${title} — coming together`}
          description="This screen is part of the system and will be wired up next. The data model, navigation and access control for it are already in place."
        />
      </div>
    </div>
  );
}
