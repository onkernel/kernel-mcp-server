'use client';

import { OrganizationMembershipResource } from '@clerk/types';
import { useAuth, useOrganizationList, useUser, CreateOrganization } from '@clerk/nextjs';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense, useEffect } from 'react';
import { Col } from '@/components/col'
import { Row } from '@/components/row'

function SelectOrgContent(): React.ReactElement {
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: {
      infinite: true,
    },
  });
  const { orgId } = useAuth();
  const { user } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(orgId || null);

  // Check if we just returned from org creation and reload to get fresh data
  useEffect(() => {
    if (searchParams.get('org_created') === 'true') {
      // Remove the flag from URL and reload to get fresh organization data
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('org_created');
      window.location.href = newUrl.toString();
    }
  }, [searchParams]);

  // Get the original OAuth parameters from the URL
  const originalParams = {
    client_id: searchParams.get('client_id'),
    redirect_uri: searchParams.get('redirect_uri'),
    response_type: searchParams.get('response_type'),
    scope: searchParams.get('scope'),
    state: searchParams.get('state'),
    code_challenge: searchParams.get('code_challenge'),
    code_challenge_method: searchParams.get('code_challenge_method'),
  };

  const handleOrgSelect = (organizationId: string): void => {
    setSelectedOrgId(organizationId);
  };

  const handleConfirm = async (): Promise<void> => {
    if (!setActive || isSelecting || !selectedOrgId) return;
    
    setIsSelecting(true);
    
    try {
      await setActive({ organization: selectedOrgId });
      
      // After setting active org, redirect back to authorize
      const authorizeUrl = new URL('/authorize', window.location.origin);
      
      // Add all original OAuth parameters
      Object.entries(originalParams).forEach(([key, value]) => {
        if (value) authorizeUrl.searchParams.set(key, value);
      });
      
      // Add the selected orgId as a parameter
      authorizeUrl.searchParams.set('org_id', selectedOrgId);

      const redirectUri = authorizeUrl.toString();
      
      router.push(redirectUri);
    } catch (error) {
      console.error('Failed to set active organization:', error);
      setIsSelecting(false);
    }
  };

  if (!isLoaded || userMemberships?.isLoading) {
    return (
      <Col className="min-h-screen items-center justify-center">
        <Col className="text-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading organizations...</p>
        </Col>
      </Col>
    );
  }

  // Check if user has any organizations (only after loaded)
  if (isLoaded && !userMemberships?.isLoading && (!userMemberships?.data || userMemberships.data.length === 0)) {
    return (
      <Col className="min-h-screen items-center justify-center">
        <Col className="text-center max-w-md mx-auto p-6 gap-6">
          <h1 className="text-2xl font-bold text-foreground">Create Organization</h1>
          <p className="text-muted-foreground">
            You need to be a member of at least one organization to continue with authorization.
          </p>
          <CreateOrganization 
            afterCreateOrganizationUrl={(() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set('org_created', 'true');
              return `/select-org?${params.toString()}`;
            })()}
            skipInvitationScreen={true}
          />
        </Col>
      </Col>
    );
  }

  return (
    <Col className="min-h-screen items-center justify-center">
      <Col className="max-w-md w-full mx-auto p-6 bg-muted rounded-lg gap-6">
        <Col className="text-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">Select Organization</h1>
          <p className="text-muted-foreground">
            Choose which organization you'd like to authorize access for.
          </p>
          {orgId && (
            <p className="text-sm text-primary">
              Currently active: {userMemberships?.data?.find(m => m.organization.id === orgId)?.organization.name || user?.organizationMemberships?.find(m => m.organization.id === orgId)?.organization.name || orgId}
            </p>
          )}
        </Col>

        <Col className="gap-3 max-h-60 overflow-y-auto border border-border/50 rounded-lg p-2 bg-background/50 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          {(userMemberships?.data || user?.organizationMemberships)
            ?.sort((a: OrganizationMembershipResource, b: OrganizationMembershipResource) => {
              // Put the currently active org first
              if (a.organization.id === orgId) return -1;
              if (b.organization.id === orgId) return 1;
              return 0;
            })
            ?.map((membership: OrganizationMembershipResource) => {
            const isSelected = membership.organization.id === selectedOrgId;
            const isCurrentlyActive = membership.organization.id === orgId;
            return (
              <button
                key={membership.organization.id}
                onClick={() => handleOrgSelect(membership.organization.id)}
                disabled={isSelecting}
                className={`w-full p-4 text-left border rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSelected 
                    ? 'border-primary bg-accent ring-2 ring-primary/20' 
                    : 'border-border hover:border-primary/50 hover:bg-accent'
                }`}
              >
                <Row className="gap-3">
                  {membership.organization.imageUrl && (
                    <img 
                      src={membership.organization.imageUrl} 
                      alt={membership.organization.name}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <Col className="flex-1 gap-1">
                    <Row className="justify-between items-center">
                      <h3 className="font-medium text-foreground">{membership.organization.name}</h3>
                      {isCurrentlyActive && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                          Active
                        </span>
                      )}
                    </Row>
                    <p className="text-sm text-muted-foreground">{membership.organization.slug}</p>
                  </Col>
                </Row>
              </button>
            );
          })}
        </Col>

        <Col className="gap-4">
          <button
            onClick={handleConfirm}
            disabled={isSelecting || !selectedOrgId}
            className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-opacity"
          >
            {isSelecting ? (
              <Row className="items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                Setting Organization
              </Row>
            ) : 'Continue with Selected Organization'}
          </button>
        </Col>
      </Col>
    </Col>
  );
}

function LoadingFallback(): React.ReactElement {
  return (
    <Col className="min-h-screen items-center justify-center">
      <Col className="text-center gap-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="text-muted-foreground">Loading...</p>
      </Col>
    </Col>
  );
}

export default function SelectOrgPage(): React.ReactElement {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SelectOrgContent />
    </Suspense>
  );
} 