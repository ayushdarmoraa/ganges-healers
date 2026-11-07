jest.mock("@/lib/prisma",()=>({prisma:{}}))
jest.mock("@/lib/email/email.service",()=>({emailService:{}}))
jest.mock("@/lib/whatsapp/interakt",()=>({}))
jest.mock("@/lib/analytics/optimization-config",()=>({optimizationConfig:{}}))
const saved=process.env.CRON_SECRET
afterAll(()=>{if(saved===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved})
for(const route of ["booking-reminders","quiz-followup","abandoned-cart","aggregate-funnel","cleanup-events"]){
test.each([[undefined,"Bearer undefined"],["","Bearer "],[" ","Bearer  "],["valid","Bearer wrong"]])(route+" rejects invalid cron auth (secret=%s)",async(secret,authorization)=>{
if(secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=secret;
const {GET}=require("../../src/app/api/cron/"+route+"/route");
const result=await GET(new Request("https://example.test",{headers:{authorization}}));expect(result.status).toBe(401)
})
}

test.each(["booking-reminders","quiz-followup","abandoned-cart","aggregate-funnel","cleanup-events"])("%s accepts valid cron auth",async(route)=>{
process.env.CRON_SECRET="unit-test-secret";
const {prisma}=require("@/lib/prisma");
for(const model of ["booking","quizLead","abandonedCart"])prisma[model]={findMany:jest.fn().mockResolvedValue([])};
prisma.funnelEvent={groupBy:jest.fn().mockResolvedValue([]),findMany:jest.fn().mockResolvedValue([]),deleteMany:jest.fn().mockResolvedValue({count:0})};
prisma.dailyFunnelStats={upsert:jest.fn().mockResolvedValue({})};
require("@/lib/analytics/optimization-config").optimizationConfig.retention={eventRetentionDays:30};
const {GET}=require("../../src/app/api/cron/"+route+"/route");
const response=await GET(new Request("https://example.test",{headers:{authorization:"Bearer unit-test-secret"}}));
expect(response.status).toBe(200);
});
