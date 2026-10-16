import 'dotenv/config';
import { app } from './app';
import { startShiftSweeper } from './tracking/tracking.scheduler';


const port=Number(process.env.PORT??3000)

app.listen(port, () => {
    console.log(` Server is running at http://localhost:${port}`);
    startShiftSweeper();
});