import {redirect} from 'next/navigation'
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const params=new URLSearchParams(await searchParams);redirect(params.has('pool')?`/limited/swiss?${params}`:'/play')}
