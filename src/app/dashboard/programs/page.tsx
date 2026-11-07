import ProgramEnrollmentPage from '@/components/programs/ProgramEnrollmentPage'
export const dynamic = 'force-dynamic'
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <ProgramEnrollmentPage scope='mine' searchParams={searchParams} /> }
